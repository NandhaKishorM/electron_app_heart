
import { retrieveContext } from "./rag_utils.js";

async function verify() {
    console.log("Verifying rag_utils.js...");

    const sampleText = `
    Patient: Jane Doe
    DOB: 01/01/1980
    History: 
    The patient presents with palpitations and shortness of breath.
    She has a history of asthma and takes Albuterol.
    No known drug allergies.
    Family history is non-contributory.
    ECG shows sinus tachycardia.
    Plan:
    1. Monitor vitals.
    2. Cardiology consult.
    `;

    try {
        const context = await retrieveContext(sampleText, "medications asthma");
        console.log("Retrieved Context:\n", context);

        if (context.includes("Albuterol") && context.includes("asthma")) {
            console.log("SUCCESS: Relevant context retrieved.");
        } else {
            console.error("FAILURE: Context missing expected keywords.");
            process.exit(1);
        }
    } catch (error) {
        console.error("ERROR:", error);
        process.exit(1);
    }
}

verify();
