from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

def create_report(filename):
    doc = SimpleDocTemplate(filename, pagesize=A4)
    elements = []
    
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        alignment=TA_CENTER,
        fontSize=18,
        textColor=colors.darkred,
        spaceAfter=10
    )
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Heading2'],
        alignment=TA_CENTER,
        fontSize=14,
        textColor=colors.black,
        spaceAfter=20
    )
    normal_style = styles['Normal']
    section_style = ParagraphStyle(
        'Section',
        parent=styles['Heading3'],
        fontSize=12,
        textColor=colors.white,
        backColor=colors.grey,
        spaceAfter=10,
        spaceBefore=10,
        leading=16,
        leftIndent=5,
        firstLineIndent=0
    )
    
    # Header
    elements.append(Paragraph("CARDIOCARE MEDICAL CENTER", title_style))
    elements.append(Paragraph("Department of Clinical Pathology", subtitle_style))
    elements.append(Paragraph("123 Medical Drive, Healthcare City | Phone: +91 9876543210", 
                              ParagraphStyle('Addr', parent=normal_style, alignment=TA_CENTER)))
    elements.append(Spacer(1, 20))
    elements.append(Paragraph("COMPREHENSIVE BLOOD INVESTIGATION REPORT", subtitle_style))
    elements.append(Spacer(1, 10))

    # Patient Info Meta Table
    meta_data = [
        ["Patient Name: Rajesh Kumar", "Report Date: 15-Dec-2025"],
        ["Age/Gender: 58 years / Male", "Report ID: BLR-2024-4521"],
        ["Referred By: Dr. Ananya Sharma", "Collection Time: 08:30 AM"],
        ["Clinical History: Acute Chest Pain; Shortness of Breath", "Sample Type: Venous Blood"]
    ]
    meta_table = Table(meta_data, colWidths=[250, 200])
    meta_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 20))

    # Cardiac Biomarkers Section
    elements.append(Paragraph("CARDIAC BIOMARKERS (CRITICAL)", section_style))
    
    biomarker_data = [
        ["Test", "Result", "Unit", "Reference Range", "Status"],
        ["🥇 1️⃣ Cardiac Troponin I (High Sensitivity)", "52.480", "ng/mL", "< 0.04", "CRITICAL HIGH"],
        ["CK-MB", "145.0", "U/L", "< 25", "HIGH"],
        ["NT-proBNP", "1250", "pg/mL", "< 125", "HIGH"],
        ["BNP", "890", "pg/mL", "< 100", "HIGH"],
        ["Myoglobin", "450", "ng/mL", "< 70", "HIGH"],
        ["hs-CRP", "12.4", "mg/L", "< 3.0", "HIGH"]
    ]
    
    biomarker_table = Table(biomarker_data, colWidths=[200, 60, 60, 80, 100])
    biomarker_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.lightgrey),
        ('TEXTCOLOR', (0,0), (-1,0), colors.black),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        # Highlight Critical Row for Troponin
        ('BACKGROUND', (0,1), (-1,1), colors.yellow),
        ('TEXTCOLOR', (0,1), (-1,1), colors.red),
        ('FONTNAME', (0,1), (-1,1), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
    ]))
    elements.append(biomarker_table)
    elements.append(Spacer(1, 20))
    
    # CBC Section
    elements.append(Paragraph("COMPLETE BLOOD COUNT (CBC)", section_style))
    cbc_data = [
        ["Test", "Result", "Unit", "Reference Range"],
        ["Hemoglobin", "13.2", "g/dL", "13.5 - 17.5"],
        ["WBC Count", "14,500", "/uL", "4,000 - 11,000"],
        ["Platelet Count", "285,000", "/uL", "150,000 - 400,000"]
    ]
    cbc_table = Table(cbc_data, colWidths=[200, 60, 60, 180])
    cbc_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.lightgrey),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
    ]))
    elements.append(cbc_table)
    elements.append(Spacer(1, 20))
    
    # Electrolytes Section
    elements.append(Paragraph("ELECTROLYTES & RENAL FUNCTION", section_style))
    elec_data = [
        ["Test", "Result", "Unit", "Reference Range"],
        ["Potassium (K+)", "4.2", "mEq/L", "3.5 - 5.0"],
        ["Sodium (Na+)", "138", "mEq/L", "136 - 145"],
        ["Creatinine", "1.1", "mg/dL", "0.7 - 1.3"]
    ]
    elec_table = Table(elec_data, colWidths=[200, 60, 60, 180])
    elec_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.lightgrey),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
    ]))
    elements.append(elec_table)
    elements.append(Spacer(1, 20))
    
    # Interpretation Box
    interp_style = ParagraphStyle(
        'Interp',
        parent=styles['Normal'],
        borderColor=colors.red,
        borderWidth=2,
        backColor=colors.mistyrose,
        borderPadding=10,
        spaceBefore=20
    )
    elements.append(Paragraph(
        "<b>Interpretation:</b><br/>"
        "Biomarker profile shows critically elevated parameters.<br/>"
        "Markedly elevated High-Sensitivity Troponin I (52.48 ng/mL) and CK-MB indicate significant myocardial necrosis.<br/>"
        "Elevated WBC count suggests acute stress response/inflammation.<br/>"
        "<b>Immediate cardiological intervention and ECG correlation are recommended to determine the exact etiology.</b>",
        interp_style
    ))
    
    # Footer
    elements.append(Spacer(1, 40))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=9)
    elements.append(Paragraph("<b>Lab Technician:</b> NABL Certified Lab &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>Consultant Pathologist:</b> Dr. Priya Mehta, MD", footer_style))
    elements.append(Paragraph("Report Generated: 15-Dec-2025 14:01 | This is a computer-generated report.", footer_style))

    # Build PDF
    doc.build(elements)

if __name__ == "__main__":
    try:
        create_report("blood_report_unbiased.pdf")
        print("Success: blood_report_unbiased.pdf created.")
    except Exception as e:
        print(f"Error: {e}")
