---
license: apache-2.0
base_model: google/medgemma-4b-it
tags:
- medical
- ecg
- cardiology
- vision-language
- medgemma
datasets:
- PULSE-ECG/ECGInstruct
language:
- en
metrics:
- accuracy
library_name: transformers
pipeline_tag: image-text-to-text
---

# MedGemma-4B ECGInstruct

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/drive/19VGxD03skunSLLRe7gIMs_zHMj9_TolQ?usp=sharing)

Fine-tuned version of Google's MedGemma-4B-it model on the ECGInstruct dataset for automated ECG interpretation.

## Model Description

This is a fully merged fine-tuned version of [google/medgemma-4b-it](https://huggingface.co/google/medgemma-4b-it) trained on the [PULSE-ECG/ECGInstruct](https://huggingface.co/datasets/PULSE-ECG/ECGInstruct) dataset containing 1.15M ECG instruction-following examples. The LoRA adapter has been merged into the base model for easier deployment.

**Developed by:** ConvAI Innovations  
**Base Model:** google/medgemma-4b-it  
**Training Infrastructure:** AIRAWAT (C-DAC) - 8x NVIDIA A100 40GB GPUs  
**Training Duration:** 72 hours (3 days)  
**Final Token Accuracy:** 86.83%  
**Final Training Loss:** 0.6188  
**GPU-Hours:** 576  
**Model Size:** ~8.5 GB

## Training Details

### Training Data
- **Dataset:** PULSE-ECG/ECGInstruct (1.15M samples)
- **Samples:** 1,156,110 ECG image-text pairs
- **Image Sources:** MIMIC-IV-ECG (~800K), PTB-XL (22K), CODE-15% (346K), ChapmanShaoxing
- **Task:** Vision-language instruction following for ECG interpretation
- **Demographics:** Age range 0-95 years, 52% male / 48% female
- **Disease Classes:** 5 superclasses (NORM, MI, STTC, CD, HYP), 24 subclasses

### Training Procedure

**Hardware:**
- 8x NVIDIA A100 40GB GPUs (AIRAWAT supercomputer)
- Distributed training with PyTorch DDP

**Training Configuration:**
- Fine-tuning method: LoRA (r=32, alpha=64, dropout=0.05)
- Target modules: all-linear (including vision encoder)
- Learning rate: 1.2e-5 with cosine decay
- Batch size: 192 effective (4 per GPU × 8 GPUs × 6 gradient accumulation)
- Optimizer: AdamW (fused)
- Precision: bfloat16
- Gradient checkpointing: Enabled
- Max sequence length: 2048 tokens
- Max new tokens: 512

**Training Metrics:**
- Final training loss: 0.6188
- Mean token accuracy: 86.83%
- Training throughput: ~9.67 samples/sec
- Total tokens processed: 103M+

## Usage

### Installation

```bash
pip install transformers pillow torch
```

### Loading the Model

```python
from transformers import AutoModelForImageTextToText, AutoProcessor
from PIL import Image

# Load model and processor
model_id = "convaiinnovations/medgemma-4b-ecginstruct"
model = AutoModelForImageTextToText.from_pretrained(
    model_id,
    torch_dtype="auto",
    device_map="auto"
)
processor = AutoProcessor.from_pretrained(model_id)
```

### Inference Example

```python
# Load ECG image
image = Image.open("ecg_image.png").convert("RGB")

# Prepare prompt using chat template
messages = [
    {
        "role": "user",
        "content": [
            {"type": "image"},
            {"type": "text", "text": "Analyze this ECG and provide a detailed interpretation."}
        ]
    }
]

# Process input
text = processor.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
inputs = processor(text=[text], images=[[image]], return_tensors="pt", padding=True)
inputs = {k: v.to(model.device) for k, v in inputs.items()}

# Generate interpretation
outputs = model.generate(
    **inputs,
    max_new_tokens=512,
    do_sample=False
)

# Decode and print
response = processor.decode(outputs[0], skip_special_tokens=True)
print(response)
```

### Example Prompts

```python
# Detailed interpretation
"Analyze this ECG and provide a detailed interpretation."

# Specific abnormality detection
"What abnormalities are present in this ECG?"

# Diagnosis suggestion
"Based on this ECG, what is the most likely diagnosis?"

# Question answering
"Does this ECG show signs of atrial fibrillation?"

# Rate and rhythm
"What is the heart rate and rhythm in this ECG?"
```

## Model Capabilities

This model can:
- ✅ Interpret 12-lead ECG images
- ✅ Identify cardiac abnormalities (arrhythmias, ischemia, hypertrophy, conduction blocks, etc.)
- ✅ Generate detailed clinical reports
- ✅ Answer specific questions about ECG findings
- ✅ Provide diagnostic suggestions
- ✅ Assess heart rate, rhythm, and axis
- ✅ Detect ST-segment changes and T-wave abnormalities

## Performance

**Training Metrics:**
| Metric | Value |
|--------|-------|
| Token Accuracy | 86.83% |
| Final Loss | 0.6188 |
| Training Time | 72 hours |
| GPU-Hours | 576 |

**Inference Metrics (A100 GPU):**
| Metric | Value |
|--------|-------|
| TTFT (Time to First Token) | ~150ms |
| ISL (Input Sequence Length) | 2048 tokens |
| OSL (Output Sequence Length) | 512 tokens |
| End-to-End Latency | 2-3 seconds |
| Throughput | ~45 tokens/sec |

## Limitations

- Trained primarily on adult ECG data
- Performance may vary on pediatric ECGs
- Should not replace professional medical diagnosis
- Requires high-quality ECG images for optimal results
- May struggle with very rare or unusual ECG patterns
- Limited to English language outputs

## Ethical Considerations

> ⚠️ **MEDICAL DISCLAIMER**
> 
> **This model is for RESEARCH AND EDUCATIONAL PURPOSES ONLY.**
> 
> - ❌ NOT validated for clinical use
> - ❌ NOT FDA/CE approved
> - ❌ NOT a substitute for professional medical diagnosis
> - ❌ Should NOT be used for patient care decisions
> 
> **Always consult qualified healthcare professionals for medical decisions.**

**Important Notes:**
- This is an AI model and can make mistakes
- ECG interpretation requires clinical context
- Model outputs should be verified by trained clinicians
- Not approved for clinical use or diagnostic purposes
- Use responsibly and within appropriate medical oversight
- Has not been tested on external clinical datasets

## Intended Use

**Appropriate Uses:**
- Research in medical AI and computer vision
- Educational demonstrations of ECG interpretation
- Development of clinical decision support prototypes
- Benchmarking ECG analysis algorithms

**Inappropriate Uses:**
- Direct patient diagnosis without physician review
- Replacement of trained medical professionals
- Use in emergency or critical care settings without oversight
- Commercial deployment without proper validation

## Citation

If you use this model in your research, please cite:

```bibtex
@misc{medgemma-ecginstruct,
  author = {convaiinnovations},
  title = {MedGemma-4B ECGInstruct: Fine-tuned ECG Interpretation Model},
  year = {2025},
  publisher = {HuggingFace},
  howpublished = {\url{https://huggingface.co/convaiinnovations/medgemma-4b-ecginstruct}}
}
```

## Acknowledgments

- **Base Model:** Google's MedGemma team for the foundation model
- **Dataset:** PULSE-ECG team for the ECGInstruct dataset
- **Infrastructure:** AIRAWAT AI Innovation Challenge by C-DAC (Centre for Development of Advanced Computing)
- **Frameworks:** HuggingFace Transformers, PEFT, TRL, PyTorch

## Related Resources

- **LoRA Adapter Version:** [convaiinnovations/medgemma-4b-ecginstruct-lora](https://huggingface.co/convaiinnovations/medgemma-4b-ecginstruct-lora)
- **Base Model:** [google/medgemma-4b-it](https://huggingface.co/google/medgemma-4b-it)
- **Training Dataset:** [PULSE-ECG/ECGInstruct](https://huggingface.co/datasets/PULSE-ECG/ECGInstruct)

## License

Apache 2.0 (following base model license)

## Contact

For questions or issues, please open an issue on the model repository or contact the maintainers.
