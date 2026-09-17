import urllib.request, json; import urllib.parse; data={'name':'Test','description':'test','folder_path':'C:/Test','status':'active','tags':'abc','file_paths':json.dumps(['LightSpeed/Wave 1D/Airetech/01_Human Capital/01_Employees/01-Source/20260902143000/emp.xlsx'])}; boundary='----WebKitFormBoundary7MA4YWxkTrZu0gW'; body=''; 
for k,v in data.items(): body+=f'--{boundary}\r\nContent-Disposition: form-data; name=\
k
\\r\n\r\n{v}\r\n'; 
body+=f'--{boundary}--\r\n'; req=urllib.request.Request('http://localhost:8000/api/v1/projects/import-from-path', method='POST'); req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}'); 
with urllib.request.urlopen(req, data=body.encode('utf-8')) as response: print(len(json.loads(response.read().decode()).get('batches', [])))
