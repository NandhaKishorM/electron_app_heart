from xhtml2pdf import pisa

def convert_html_to_pdf(source_html, output_filename):
    result_file = open(output_filename, "w+b")
    pisa_status = pisa.CreatePDF(
            source_html,                # the HTML to convert
            dest=result_file)           # file handle to recieve result
    result_file.close()
    return pisa_status.err

html_content = """
<!DOCTYPE html>
<html>
<head>
<style>
    body { font-family: Helvetica, sans-serif; font-size: 12px; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .title { font-size: 18px; font-weight: bold; color: #cc0000; }
    .subtitle { font-size: 14px; font-weight: bold; }
    .meta-table { width: 100%; margin-bottom: 20px; }
    .meta-table td { padding: 4px; }
    .section-header { background-color: #f0f0f0; padding: 5px; font-weight: bold; border-bottom: 1px solid #ccc; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { text-align: left; border-bottom: 1px solid #000; padding: 5px; }
    td { padding: 5px; border-bottom: 1px solid #eee; }
    .critical { color: #cc0000; font-weight: bold; }
    .footer { margin-top: 50px; border-top: 1px solid #000; padding-top: 10px; font-size: 10px; }
    .highlight { background-color: #ffffcc; }
</style>
</head>
<body>

<div class="header">
    <div class="title">CARDIOCARE MEDICAL CENTER</div>
    <div>Department of Clinical Pathology</div>
    <div>123 Medical Drive, Healthcare City | Phone: +91 9876543210</div>
    <br>
    <div class="subtitle">COMPREHENSIVE BLOOD INVESTIGATION REPORT</div>
</div>

<table class="meta-table">
    <tr>
        <td><strong>Patient Name:</strong> Rajesh Kumar</td>
        <td><strong>Report Date:</strong> 15-Dec-2025</td>
    </tr>
    <tr>
        <td><strong>Age/Gender:</strong> 58 years / Male</td>
        <td><strong>Report ID:</strong> BLR-2024-4521</td>
    </tr>
    <tr>
        <td><strong>Referred By:</strong> Dr. Ananya Sharma</td>
        <td><strong>Collection Time:</strong> 08:30 AM</td>
    </tr>
    <tr>
        <td><strong>Clinical History:</strong> Acute Chest Pain; Suspected Anterolateral STEMI</td>
        <td><strong>Sample Type:</strong> Venous Blood</td>
    </tr>
</table>

<div class="section-header">CARDIAC BIOMARKERS (CRITICAL)</div>
<table>
    <tr>
        <th>Test</th>
        <th>Result</th>
        <th>Unit</th>
        <th>Reference Range</th>
        <th>Status</th>
    </tr>
    <tr class="highlight">
        <td class="critical">🥇 1️⃣ Cardiac Troponin I (High Sensitivity)</td>
        <td class="critical">52.480</td>
        <td class="critical">ng/mL</td>
        <td class="critical">&lt; 0.04</td>
        <td class="critical">CRITICAL HIGH</td>
    </tr>
    <tr>
        <td>CK-MB</td>
        <td>145.0</td>
        <td>U/L</td>
        <td>&lt; 25</td>
        <td>HIGH</td>
    </tr>
    <tr>
        <td>NT-proBNP</td>
        <td>1250</td>
        <td>pg/mL</td>
        <td>&lt; 125</td>
        <td>HIGH</td>
    </tr>
    <tr>
        <td>BNP</td>
        <td>890</td>
        <td>pg/mL</td>
        <td>&lt; 100</td>
        <td>HIGH</td>
    </tr>
    <tr>
        <td>Myoglobin</td>
        <td>450</td>
        <td>ng/mL</td>
        <td>&lt; 70</td>
        <td>HIGH</td>
    </tr>
    <tr>
        <td>hs-CRP</td>
        <td>12.4</td>
        <td>mg/L</td>
        <td>&lt; 3.0</td>
        <td>HIGH</td>
    </tr>
</table>

<div class="section-header">COMPLETE BLOOD COUNT (CBC)</div>
<table>
    <tr>
        <th>Test</th>
        <th>Result</th>
        <th>Unit</th>
        <th>Reference Range</th>
    </tr>
    <tr>
        <td>Hemoglobin</td>
        <td>13.2</td>
        <td>g/dL</td>
        <td>13.5 - 17.5</td>
    </tr>
    <tr>
        <td>WBC Count</td>
        <td>14,500</td>
        <td>/uL</td>
        <td>4,000 - 11,000</td>
    </tr>
    <tr>
        <td>Platelet Count</td>
        <td>285,000</td>
        <td>/uL</td>
        <td>150,000 - 400,000</td>
    </tr>
</table>

<div class="section-header">ELECTROLYTES & RENAL FUNCTION</div>
<table>
    <tr>
        <th>Test</th>
        <th>Result</th>
        <th>Unit</th>
        <th>Reference Range</th>
    </tr>
    <tr>
        <td>Potassium (K+)</td>
        <td>4.2</td>
        <td>mEq/L</td>
        <td>3.5 - 5.0</td>
    </tr>
    <tr>
        <td>Sodium (Na+)</td>
        <td>138</td>
        <td>mEq/L</td>
        <td>136 - 145</td>
    </tr>
    <tr>
        <td>Creatinine</td>
        <td>1.1</td>
        <td>mg/dL</td>
        <td>0.7 - 1.3</td>
    </tr>
</table>

<br><br>
<div style="border: 2px solid #cc0000; padding: 10px; background-color: #fff0f0;">
    <strong>Interpretation:</strong><br>
    Biomarker profile consistent with <strong>Acute Myocardial Infarction (Anterolateral STEMI)</strong>.<br>
    Markedly elevated High-Sensitivity Troponin I and CK-MB indicate significant myocardial necrosis.<br>
    Elevated WBC count suggests acute stress response/inflammation.<br>
    <strong>Immediate cardiological intervention (Angiography/PCI) is recommended.</strong>
</div>

<div class="footer">
    <table style="border: none;">
        <tr>
            <td style="border: none;"><strong>Lab Technician:</strong> NABL Certified Lab</td>
            <td style="border: none; text-align: right;"><strong>Consultant Pathologist:</strong> Dr. Priya Mehta, MD</td>
        </tr>
    </table>
    <br>
    Report Generated: 15-Dec-2025 14:01 | This is a computer-generated report.
</div>

</body>
</html>
"""

convert_html_to_pdf(html_content, "anterolateral_stemi_report.pdf")
print("PDF generated successfully: anterolateral_stemi_report.pdf")
