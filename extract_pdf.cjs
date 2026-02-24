const fs = require('fs');
const pdfParsing = require('pdf-parse');

const dataBuffer = fs.readFileSync('sample_blood_report.pdf');

// Try to handle both default export and direct export scenarios
const pdf = pdfParsing.default || pdfParsing;

pdf(dataBuffer).then(function (data) {
    console.log(data.text);
}).catch(err => {
    console.error("Error parsing PDF:", err);
});
