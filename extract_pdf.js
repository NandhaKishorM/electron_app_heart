import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

const dataBuffer = fs.readFileSync('sample_blood_report.pdf');

pdf(dataBuffer).then(function (data) {
    console.log(data.text);
});
