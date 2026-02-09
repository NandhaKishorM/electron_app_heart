
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const AssessmentSchema = z.object({
    ecg_findings: z.string().describe("Detailed findings from the ECG analysis, including rhythm, rate, and ST-T changes."),
    report_findings: z.string().describe("Key findings from the clinical report, including history and risk factors."),
    clinical_assessment: z.string().describe("Comprehensive clinical assessment combining ECG and report data."),
    next_steps: z.array(z.string()).describe("List of immediate and follow-up medical actions."),
    lifestyle_recommendations: z.array(z.string()).describe("List of lifestyle modifications and patient education points.")
});

console.log("--- Schema with Name 'assessment' ---");
const schemaWithName = zodToJsonSchema(AssessmentSchema, "assessment");
console.log(JSON.stringify(schemaWithName, null, 2));

console.log("\n--- Schema without Name ---");
const schemaWithoutName = zodToJsonSchema(AssessmentSchema);
console.log(JSON.stringify(schemaWithoutName, null, 2));
