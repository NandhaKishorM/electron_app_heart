Project name

AI4Cardio -  An Offline Desktop App for Multimodal ECG and blood report interpretation with explainability

Our team

Nandakishor M (CEO, ConvAI Innovations) - Lead Developer. Built the desktop application, fine-tuned the model on AIRAWAT, and implemented the CMAS explainability layer.
Dr. Anjali M (Medical Director) - Clinical Lead. Assistant Professor at Dr. Moopan's Medical College, Wayanad. Led dataset curation from clinical archives and provided medical validation of model outputs.

Problem statement

When someone having chest pain go to a primary health or hospitals center in rural areas, there may not be a specialist available at that moment, this mean the ECGs taken at the moment can not be accurately interpreted within small window of time, if they did not find variations, the patient has to do a blood test, that means if the patient having STEMI and there are blood biomarkers supporting it, without an expert it will be difficult to conclude diagnosis, according to NIH this is leading to around 228 deaths every hour around the globe

Overall solution:

We built a desktop application that works completely offline that helps healthcare workers to upload ECG images and blood reports to get a final diagnosis. The platform has a heatmap interpretation feature, which is simply a heatmap overlay of the attention details from the medgemma vision encoder(MedSigLIP) also we have introduced hallunox python package which will helps to reduce hallucination by implementing an interesting strategy of projecting the models internal hidden state to a common projection space and doing a semantic similarity with the input query after it has been converted to embedding vectors using a powerful embedding model.(https://pypi.org/project/hallunox/) , hallunox is not implemented on desktop app yet, we can integrate the logic in javascript, the work is going on.
The both approach has been implemented to kinda eliminate the blackbox nature of the model. It is the healthcare sector, and doctors need to trust the platform. We made this to work completely offline to comply with HIPPA, GDPR etc. If the data never leaves the system, it is kinda secured and compliant.

Technical details

The first part in building such a system is ofcourse is to fine-tune the model on a large corpus of ECG images along with instruction, the model should be lightweight, and should have GPU quantization support (https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md) , and can run on mid-level PCs
We had chosen https://huggingface.co/datasets/PULSE-ECG/ECGInstruct dataset, as it has around 1 million ECG images, and it has PTB-XL, ECG-QA, MIMIC-IV-ECG, and CODE-15 dataset, now we have the dataset to download. Now comes another problem: which model to choose from? https://huggingface.co/google/medgemma-4b-it is the right choice, as after multimodal quantization, we can easily run on any devices, including android/iOS phones.
But there is a problem: we need a couple of A100 or H100 GPUs to train the model. Thats when we heard an AI innovation challenge happening in early December 2025.  The C-DAC AI Innovation Challenge (also known as the AIRAWAT AI Innovation Challenge) was the perfect opportunity to gather some A100 to fire the fine-tuning with Indian super computer, as we know we cant fine-tune even the 4B model on 2xT4 or single P100 from kaggle or single H100 from colab, we need at least 8xA100 40GB VRAM GPUs, so we applied to the competition, got shortlisted. Then we got access to 8xA100 GPUS(40GB VRAM) for 7 days, the first thing we did was directly train on the login node, and within minutes we couldn’t access the HPC clusters, and we requested the access after we created slurm files(https://huggingface.co/convaiinnovations/medgemma-4b-ecginstruct/blob/main/submit_training.slurm)  for training the model, after that we trained it for 3 days straight. The final data are

Final training loss: 0.6188
Mean token accuracy: 86.83%
Training throughput: ~9.67 samples/sec
Total tokens processed: 103M+
Since we use LoRA PEFT fine-tuning, we then merged the adapter model with the base model.
Now comes with another problem, how we can build good interpretation system but that works on a desktop app, and which language to choose for building the desktop app, then comes electron and we can use node-llama-cpp to run the quantized gguf model and mmproj gguf model, but how to make a attention heatmap , mmproj can’t do it, we need to extract the siglip encoder and use it somehow in the app, thats when we see onnx-runtime and there is node package for it, then we created a script https://www.kaggle.com/code/nandukuttan/vision-tower-4545478bn and converted the vision encoder to onnx, then again applied dynamic 4-bit quantization to make it again small to run on very small end device, then we started working on the desktop app, we use sqlite to store the infos. The main problem is choosing an agentic orchestrator, because we are uploading an ECG image and also a blood report, both of which need to be analysed and combined to get a final diagnosis. Additionally, we need to integrate the ONNX vision encoder for heatmap visualization. We had chosen the langgraph js and using a node based approach, we had solved it.
Now the user can upload the ECG images and blood reports to get final analysis and heatmap generation to visualize attention, along with next steps to be taken(like what tests or surgery if needed), and also lifestyle recommendations.  TLDR: We fine-tuned the MedGEMMA 4 billion parameter model on 1 million ECG images on 4XA100, then quantized the model as gguf and onnx files, then built a desktop application with LangGraph orchestrator, such that health care workers can upload ECG images and blood reports to get a final diagnosis and a heatmap.