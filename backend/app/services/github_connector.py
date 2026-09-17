from typing import Any

import httpx
import base64
import io
import os

import pandas as pd

GITHUB_API_URL = "https://api.github.com"


class GitHubConnectorError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class GitHubConnectorService:
    @staticmethod
    def _headers(token: str) -> dict[str, str]:
        return {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    @staticmethod
    async def _get(path: str, token: str, params: dict[str, Any] | None = None) -> Any:
        if not token.strip():
            raise GitHubConnectorError(400, "A GitHub personal access token is required.")

        try:
            async with httpx.AsyncClient(base_url=GITHUB_API_URL, timeout=20.0) as client:
                response = await client.get(path, headers=GitHubConnectorService._headers(token), params=params)
        except httpx.RequestError as exc:
            raise GitHubConnectorError(502, f"GitHub is unavailable: {exc}") from exc

        if response.is_error:
            if response.status_code in (401, 403):
                message = "GitHub rejected the token. Check that it is valid and has repository access."
            elif response.status_code == 404:
                message = "The GitHub repository or branch was not found."
            else:
                message = f"GitHub API request failed with status {response.status_code}."
            raise GitHubConnectorError(response.status_code, message)

        return response.json()

    @staticmethod
    async def _request(method: str, path: str, token: str, payload: dict[str, Any] | None = None) -> Any:
        if not token.strip():
            raise GitHubConnectorError(400, "A GitHub personal access token is required.")
        try:
            async with httpx.AsyncClient(base_url=GITHUB_API_URL, timeout=30.0) as client:
                response = await client.request(method, path, headers=GitHubConnectorService._headers(token), json=payload)
        except httpx.RequestError as exc:
            raise GitHubConnectorError(502, f"GitHub is unavailable: {exc}") from exc
        if response.is_error:
            if response.status_code in (401, 403):
                message = "GitHub rejected the token or write permission is missing."
            elif response.status_code == 409:
                message = "GitHub reported a conflict. Refresh the branch and try again."
            else:
                message = f"GitHub API request failed with status {response.status_code}."
            raise GitHubConnectorError(response.status_code, message)
        return response.json()

    @staticmethod
    async def list_repositories(token: str) -> list[dict[str, Any]]:
        repositories = await GitHubConnectorService._get(
            "/user/repos",
            token,
            params={
                "per_page": 100,
                "affiliation": "owner,collaborator,organization_member",
                "sort": "updated",
            },
        )
        return [
            {
                "id": repository["id"],
                "name": repository["name"],
                "full_name": repository["full_name"],
                "visibility": repository.get("visibility") or ("private" if repository.get("private") else "public"),
                "branch": repository.get("default_branch") or "main",
                "updated_at": repository.get("updated_at"),
                "html_url": repository.get("html_url"),
            }
            for repository in repositories
        ]

    @staticmethod
    async def list_branches(token: str, owner: str, repository: str) -> list[dict[str, Any]]:
        branches = await GitHubConnectorService._get(f"/repos/{owner}/{repository}/branches", token, params={"per_page": 100})
        return [{"name": branch["name"], "protected": branch.get("protected", False)} for branch in branches]

    @staticmethod
    async def write_file(
        token: str,
        owner: str,
        repository: str,
        branch: str,
        path: str,
        content: str,
        message: str,
        workbook: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        existing = None
        try:
            existing = await GitHubConnectorService._get(f"/repos/{owner}/{repository}/contents/{path}", token, params={"ref": branch})
        except GitHubConnectorError as exc:
            if exc.status_code != 404:
                raise
        file_bytes = content.encode("utf-8")
        if workbook is not None:
            if os.path.splitext(path)[1].lower() != ".xlsx":
                raise GitHubConnectorError(400, "Editing legacy .xls files is not supported. Save the workbook as .xlsx first.")
            output = io.BytesIO()
            try:
                with pd.ExcelWriter(output, engine="openpyxl") as writer:
                    for sheet in workbook:
                        sheet_name = str(sheet.get("name", "Sheet1"))[:31] or "Sheet1"
                        columns = [str(column) for column in sheet.get("columns", [])]
                        rows = sheet.get("rows", [])
                        pd.DataFrame(rows, columns=columns).to_excel(writer, sheet_name=sheet_name, index=False)
            except Exception as exc:
                raise GitHubConnectorError(422, f"Unable to build the Excel workbook: {exc}") from exc
            file_bytes = output.getvalue()

        payload: dict[str, Any] = {
            "message": message,
            "content": base64.b64encode(file_bytes).decode("ascii"),
            "branch": branch,
        }
        if existing and isinstance(existing, dict) and existing.get("sha"):
            payload["sha"] = existing["sha"]
        result = await GitHubConnectorService._request("PUT", f"/repos/{owner}/{repository}/contents/{path}", token, payload)
        return {"path": path, "commit": result.get("commit", {}).get("html_url"), "updated": bool(existing)}

    @staticmethod
    async def list_files(token: str, owner: str, repository: str, branch: str) -> list[dict[str, Any]]:
        tree = await GitHubConnectorService._get(
            f"/repos/{owner}/{repository}/git/trees/{branch}",
            token,
            params={"recursive": "1"},
        )
        return [
            {
                "name": item["path"].split("/")[-1],
                "path": item["path"],
                "type": "file",
                "size": item.get("size", 0),
                "url": f"https://github.com/{owner}/{repository}/blob/{branch}/{item['path']}",
            }
            for item in tree.get("tree", [])
            if item.get("type") == "blob"
        ]

    @staticmethod
    async def get_file_content(token: str, owner: str, repository: str, branch: str, path: str) -> dict[str, Any]:
        file_data = await GitHubConnectorService._get(
            f"/repos/{owner}/{repository}/contents/{path}",
            token,
            params={"ref": branch},
        )
        try:
            if file_data.get("encoding") == "base64" and "content" in file_data:
                raw_content = base64.b64decode(file_data["content"])
            elif file_data.get("download_url"):
                async with httpx.AsyncClient(timeout=30.0) as client:
                    download = await client.get(file_data["download_url"], headers=GitHubConnectorService._headers(token))
                if download.is_error:
                    raise GitHubConnectorError(download.status_code, "GitHub could not download this file.")
                raw_content = download.content
            else:
                raise GitHubConnectorError(415, "This file type cannot be previewed in the browser.")
        except (ValueError, UnicodeDecodeError) as exc:
            raise GitHubConnectorError(415, "This file is binary and cannot be previewed in the browser.") from exc

        extension = os.path.splitext(path)[1].lower()
        if extension in {".csv", ".txt", ".dat"}:
            try:
                dataframe = pd.read_csv(io.BytesIO(raw_content), nrows=100)
                dataframe.columns = [str(column) for column in dataframe.columns]
                return {
                    "path": file_data.get("path", path), "size": file_data.get("size", len(raw_content)),
                    "kind": "table", "columns": list(dataframe.columns),
                    "rows": dataframe.fillna("").astype(str).to_dict(orient="records"),
                    "content": raw_content.decode("utf-8"), "url": file_data.get("html_url"),
                }
            except Exception as exc:
                raise GitHubConnectorError(422, f"Unable to parse this delimited file: {exc}") from exc

        if extension in {".xlsx", ".xls"}:
            try:
                workbook = pd.ExcelFile(io.BytesIO(raw_content))
                preview_sheets = []
                for sheet_name in workbook.sheet_names:
                    # These migration workbooks use row 1 for source/group labels
                    # and row 2 for the actual column labels.
                    raw_frame = pd.read_excel(workbook, sheet_name=sheet_name, header=None)
                    header_row = GitHubConnectorService._find_excel_header_row(raw_frame)
                    full_dataframe = pd.read_excel(
                        workbook,
                        sheet_name=sheet_name,
                        header=header_row,
                    )
                    labeled_dataframe = GitHubConnectorService._apply_group_labels(
                        full_dataframe,
                        raw_frame.iloc[0].tolist() if len(raw_frame) else [],
                    )
                    cleaned_dataframe = GitHubConnectorService._clean_excel_frame(labeled_dataframe)
                    dataframe = cleaned_dataframe.head(100)
                    dataframe.columns = [str(column) for column in dataframe.columns]
                    preview_sheets.append({
                        "name": str(sheet_name),
                        "columns": list(dataframe.columns),
                        "rows": dataframe.fillna("").astype(str).to_dict(orient="records"),
                        "preview_rows": len(dataframe),
                        "total_rows": len(cleaned_dataframe),
                        "header_row": header_row + 1,
                    })
                return {
                    "path": file_data.get("path", path), "size": file_data.get("size", len(raw_content)),
                    "kind": "workbook", "sheets": preview_sheets, "url": file_data.get("html_url"),
                }
            except Exception as exc:
                raise GitHubConnectorError(422, f"Unable to parse this workbook: {exc}") from exc

        try:
            content = raw_content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise GitHubConnectorError(415, "This file is binary and cannot be previewed in the browser.") from exc
        return {
            "path": file_data.get("path", path),
            "size": file_data.get("size", len(raw_content)),
            "kind": "text",
            "content": content,
            "url": file_data.get("html_url"),
        }

    @staticmethod
    def _find_excel_header_row(frame: pd.DataFrame) -> int:
        """Find the row containing actual field labels rather than report labels."""
        for index in range(min(len(frame), 10)):
            values = [str(value).strip().lower() for value in frame.iloc[index].tolist() if pd.notna(value)]
            label_count = sum(label in {"type", "date", "num", "name", "open balance", "due date"} for label in values)
            if label_count >= 3:
                return index
        return 0

    @staticmethod
    def _clean_excel_frame(frame: pd.DataFrame) -> pd.DataFrame:
        # Drop columns that are entirely empty, including pandas' Unnamed columns.
        cleaned = frame.dropna(axis=1, how="all").copy()
        cleaned.columns = [
            str(column).strip() if not str(column).startswith("Unnamed:") else f"Column {index + 1}"
            for index, column in enumerate(cleaned.columns)
        ]

        # Remove blank rows and report footer rows such as balance summaries.
        cleaned = cleaned.dropna(axis=0, how="all")
        footer_markers = cleaned.astype(str).apply(
            lambda column: column.str.contains(
                "per balance sheet|immaterial discrepency|immaterial discrepancy",
                case=False,
                na=False,
            )
        ).any(axis=1)
        cleaned = cleaned.loc[~footer_markers]
        return cleaned.reset_index(drop=True)

    @staticmethod
    def _apply_group_labels(frame: pd.DataFrame, group_labels: list[Any]) -> pd.DataFrame:
        """Use the report's first header row for fields blank in the data header row."""
        renamed = frame.copy()
        names: list[str] = []
        used: set[str] = set()
        for index, column in enumerate(renamed.columns):
            current = str(column).strip()
            group = str(group_labels[index]).strip() if index < len(group_labels) and pd.notna(group_labels[index]) else ""
            name = group if current.startswith("Unnamed:") and group else current
            if not name or name.startswith("Unnamed:"):
                name = f"Column {index + 1}"
            original_name = name
            suffix = 2
            while name in used:
                name = f"{original_name} {suffix}"
                suffix += 1
            used.add(name)
            names.append(name)
        renamed.columns = names
        return renamed
