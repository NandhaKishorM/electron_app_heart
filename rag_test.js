
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

async function testRAG() {
    console.log("Initializing Embeddings...");
    const embeddings = new HuggingFaceTransformersEmbeddings({
        modelName: "Xenova/all-MiniLM-L6-v2",
    });

    console.log("Creating Vector Store...");
    const vectorStore = new HNSWLib(embeddings, { space: "cosine" });

    const text = `
    The patient, John Doe, is a 45-year-old male with a history of hypertension and hyperlipidemia.
    He presented with chest pain starting 2 hours ago.
    ECG shows ST segment elevation in leads V1-V4.
    Troponin levels are elevated at 0.5 ng/mL.
    Patient is allergic to penicillin.
    Family history includes father with MI at age 50.
    Current medications include Lisinopril 10mg daily.
    `;

    console.log("Splitting Text...");
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 100,
        chunkOverlap: 20,
    });
    const docs = await splitter.createDocuments([text]);
    console.log(`Created ${docs.length} chunks.`);

    console.log("Indexing Documents...");
    await vectorStore.addDocuments(docs);

    console.log("Performing Similarity Search...");
    const relevantDocs = await vectorStore.similaritySearch("medications allergy", 2);

    console.log("\n--- Relevant Context ---");
    relevantDocs.forEach(d => console.log(d.pageContent));
}

testRAG().catch(console.error);
