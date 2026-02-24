import importlib.util

packages = ['pypdf', 'PyPDF2', 'pdfminer', 'pdfplumber', 'reportlab', 'xhtml2pdf']
found = {}

for pkg in packages:
    spec = importlib.util.find_spec(pkg)
    found[pkg] = spec is not None
    print(f"{pkg}: {found[pkg]}")
