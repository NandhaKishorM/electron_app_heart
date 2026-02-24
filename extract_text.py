import pdfplumber

with pdfplumber.open("sample_blood_report.pdf") as pdf:
    full_text = ""
    for page in pdf.pages:
        full_text += page.extract_text() + "\n"

print(full_text)
