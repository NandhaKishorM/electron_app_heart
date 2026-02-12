---
license: apache-2.0
tags:
- medical
- ecg
- cardiology
- training-metrics
- visualization
---

# MedGemma ECG Training Metrics

Training metrics and visualization plots from fine-tuning MedGemma-4B on ECG datasets.

## Overview

This repository contains training metrics, loss curves, and performance visualizations from fine-tuning Google's MedGemma-4B-it model on ECG interpretation tasks using the PTB-XL subset of the ECGInstruct dataset.

## Training Details

**Model:** google/medgemma-4b-it (fine-tuned with LoRA)  
**Dataset:** PULSE-ECG/ECGInstruct (PTB-XL subset)  
**Infrastructure:** AIRAWAT (C-DAC) - 8x NVIDIA A100 40GB GPUs  
**Training Duration:** ~16.5 hours (2 epochs)

### Final Metrics

| Metric | Value |
|--------|-------|
| **Token Accuracy** | 89.62% |
| **Training Loss** | 0.99 |
| **Entropy** | 0.985 |
| **Total Tokens** | 103,301,284 |

## Visualization Plots

### Training Dashboard
![Training Dashboard](training_dashboard.png)

Combined view of all training metrics including loss, accuracy, learning rate, gradient norm, and entropy.

### Individual Plots

| Plot | Description |
|------|-------------|
| ![Loss Curve](loss_curve.png) | Training loss over epochs with smoothed trend line |
| ![Accuracy](accuracy_curve.png) | Token accuracy (train & eval) over time |
| ![Learning Rate](learning_rate.png) | Cosine learning rate schedule |
| ![Gradient Norm](gradient_norm.png) | Gradient norm stability |
| ![Entropy](entropy.png) | Model entropy (confidence) over training |

## Training Configuration

```yaml
# LoRA Settings
lora_r: 32
lora_alpha: 64
lora_dropout: 0.05

# Training Hyperparameters
epochs: 2
learning_rate: 2e-4
batch_size: 192 (effective)
optimizer: AdamW (fused)
lr_scheduler: cosine
precision: bfloat16
gradient_checkpointing: true
```

## Key Observations

1. **Loss Convergence**: Training loss decreased smoothly from ~10 to ~1.6
2. **Accuracy Improvement**: Token accuracy improved from 50% (random) to 89.6%
3. **Stable Training**: Gradient norms remained stable (0.7-0.9)
4. **Entropy Reduction**: Model became more confident over training

## Related Resources

- **Fine-tuned Model:** [convaiinnovations/medgemma-4b-ecginstruct](https://huggingface.co/convaiinnovations/medgemma-4b-ecginstruct/)
- **Base Model:** [google/medgemma-4b-it](https://huggingface.co/google/medgemma-4b-it)
- **Dataset:** [PULSE-ECG/ECGInstruct](https://huggingface.co/datasets/PULSE-ECG/ECGInstruct)

## Acknowledgments

- **Infrastructure:** AIRAWAT AI Innovation Challenge by C-DAC
- **Base Model:** Google MedGemma team
- **Dataset:** PULSE-ECG team

## License

Apache 2.0
