#!/usr/bin/env python3
"""
Fine-tuning MedGemma-4B on ECGInstruct Dataset with Multi-GPU Support
Optimized for 8xA100 40GB GPUs
"""

import os
import torch
import wandb

# Disable WandB online mode since compute nodes don't have internet access
os.environ["WANDB_MODE"] = "offline"

# Force HuggingFace to use offline mode (all resources are cached)
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
from dataclasses import dataclass, field
from typing import Any, Optional
from datasets import load_dataset
from transformers import (
    AutoProcessor,
    AutoModelForImageTextToText,
    BitsAndBytesConfig,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model
from trl import SFTTrainer, SFTConfig
import evaluate
from datetime import datetime
import numpy as np


@dataclass
class TrainingConfig:
    """Configuration for training"""
    # Model settings
    model_id: str = "./models/medgemma-4b-it"  # Local model path (no internet needed)
    output_dir: str = "medgemma-4b-ecginstruct-lora"
    
    # Dataset settings
    dataset_name: str = "PULSE-ECG/ECGInstruct"
    dataset_subset: str = "ECGInstruct"
    dataset_cache_dir: str = "./ecg_dataset_cache"  # Local cache with downloaded images
    image_folder: str = "./ecg_images"  # Directory with extracted images from tar.gz shards
    train_samples: Optional[int] = None  # None = use all samples
    eval_samples: int = 2000
    
    # LoRA settings
    lora_r: int = 32
    lora_alpha: int = 64
    lora_dropout: float = 0.05
    
    # Training hyperparameters (UPDATED – BEST SETUP)
    num_train_epochs = 3
    per_device_train_batch_size = 4       # per GPU
    per_device_eval_batch_size = 4
    gradient_accumulation_steps = 8       # effective batch size = 4*8*8 = 256
    learning_rate = 1.2e-5                # safer for LoRA fine-tuning
    max_grad_norm = 1.0
    warmup_ratio = 0.1
    weight_decay = 0.005

    # Optimization settings
    optim: str = "adamw_torch_fused"
    lr_scheduler_type: str = "cosine"
    
    # Logging and evaluation
    logging_steps: int = 10
    eval_steps: int = 100
    save_steps: int = 1000
    save_total_limit: int = 3
    
    # WandB settings
    wandb_project: str = "medgemma-ecginstruct"
    wandb_run_name: Optional[str] = None
    
    # System settings
    bf16: bool = True
    gradient_checkpointing: bool = True
    dataloader_num_workers: int = 8
    max_seq_length: int = 2048
    deepspeed: Optional[str] = "./deepspeed_config.json"  # DeepSpeed ZeRO-3 config
    
    # Generation settings for evaluation
    max_new_tokens: int = 512
    
    def __post_init__(self):
        if self.wandb_run_name is None:
            self.wandb_run_name = f"medgemma-ecg-{datetime.now().strftime('%Y%m%d-%H%M%S')}"


def setup_wandb(config: TrainingConfig):
    """Initialize Weights & Biases logging"""
    wandb.init(
        project=config.wandb_project,
        name=config.wandb_run_name,
        config={
            "model_id": config.model_id,
            "dataset": config.dataset_name,
            "lora_r": config.lora_r,
            "lora_alpha": config.lora_alpha,
            "learning_rate": config.learning_rate,
            "batch_size": config.per_device_train_batch_size * config.gradient_accumulation_steps * torch.cuda.device_count(),
            "num_epochs": config.num_train_epochs,
        }
    )


def load_and_prepare_dataset(config: TrainingConfig):
    """Load ECGInstruct dataset and prepare for training"""
    print(f"Loading dataset from local cache: {config.dataset_cache_dir}")
    
    # Load from local JSON file (offline mode)
    # The dataset was downloaded with huggingface-cli to ecg_dataset_cache
    import glob
    json_files = glob.glob(f"{config.dataset_cache_dir}/**/*.json", recursive=True)
    
    if not json_files:
        raise FileNotFoundError(
            f"No JSON files found in {config.dataset_cache_dir}. "
            "Please download the dataset first using: "
            "huggingface-cli download PULSE-ECG/ECGInstruct --repo-type dataset --local-dir ecg_dataset_cache"
        )
    
    # Use the first JSON file found (should be ECGInstruct.json)
    json_file = json_files[0]
    print(f"Loading from: {json_file}")
    
    dataset = load_dataset(
        "json",
        data_files=json_file,
        split="train"
    )
    
    print(f"Total dataset size: {len(dataset)}")
    
    # Filter for PTB-XL only
    print("Filtering for PTB-XL dataset only...")
    def is_ptb_xl(example):
        """Check if sample is from PTB-XL dataset"""
        image_path = example.get('image', '')
        return 'ptb-xl' in image_path.lower()
    
    dataset = dataset.filter(is_ptb_xl)
    print(f"PTB-XL samples: {len(dataset)}")
    
    if len(dataset) == 0:
        raise ValueError("No PTB-XL samples found in dataset!")
    
    # Shuffle and split
    dataset = dataset.shuffle(seed=42)
    
    # Create train/eval split
    if config.train_samples is not None:
        total_samples = config.train_samples + config.eval_samples
        dataset = dataset.select(range(min(total_samples, len(dataset))))
    
    # Split into train and validation
    split_dataset = dataset.train_test_split(
        test_size=config.eval_samples,
        seed=42
    )
    
    train_dataset = split_dataset["train"]
    eval_dataset = split_dataset["test"]
    
    if config.train_samples is not None:
        train_dataset = train_dataset.select(range(min(config.train_samples, len(train_dataset))))
    
    print(f"Training samples: {len(train_dataset)}")
    print(f"Evaluation samples: {len(eval_dataset)}")
    
    # Format dataset to expected structure
    def format_sample(example):
        """
        ECGInstruct format:
        - 'image': PIL Image
        - 'conversations': List of conversation turns with roles
        """
        # Convert conversations to messages format if needed
        if 'conversations' in example and 'messages' not in example:
            conversations = example['conversations']
            messages = []
            
            for conv in conversations:
                role = conv.get('from', conv.get('role', 'user'))
                content = conv.get('value', conv.get('content', ''))
                
                # Normalize role names
                if role in ['human', 'user']:
                    role = 'user'
                elif role in ['gpt', 'assistant']:
                    role = 'assistant'
                
                # Handle content format
                if role == 'user' and 'image' in example:
                    # First user message includes image
                    if len(messages) == 0:
                        messages.append({
                            "role": "user",
                            "content": [
                                {"type": "image"},
                                {"type": "text", "text": content}
                            ]
                        })
                    else:
                        messages.append({
                            "role": "user",
                            "content": [{"type": "text", "text": content}]
                        })
                else:
                    messages.append({
                        "role": role,
                        "content": [{"type": "text", "text": content}]
                    })
            
            example['messages'] = messages
        
        return example
    
    train_dataset = train_dataset.map(format_sample)
    eval_dataset = eval_dataset.map(format_sample)
    
    # Print a sample
    print("\nSample from training dataset:")
    sample = train_dataset[0]
    print(f"Image: {sample['image']}")
    print(f"Messages: {sample['messages'][:2]}")  # Print first 2 messages
    
    return train_dataset, eval_dataset


def create_data_collator(processor, config):
    """Create custom data collator for multimodal data"""
    def collate_fn(examples):
        texts = []
        images = []
        
        for example in examples:
            # Get image - it's a file path string in the dataset
            image_path = example["image"]
            # Construct full path if not absolute
            if not os.path.isabs(image_path):
                image_path = os.path.join(config.image_folder, image_path)
            
            # Try to load image, skip if not found
            try:
                from PIL import Image
                image = Image.open(image_path).convert("RGB")
                images.append([image])  # Processor expects list of images per example
                
                # Apply chat template
                text = processor.apply_chat_template(
                    example["messages"],
                    add_generation_prompt=False,
                    tokenize=False
                ).strip()
                texts.append(text)
            except FileNotFoundError:
                # Skip this sample if image is missing
                import warnings
                warnings.warn(f"Image not found, skipping: {image_path}", UserWarning)
                continue
            except Exception as e:
                # Skip on any other error
                import warnings
                warnings.warn(f"Error loading image {image_path}: {e}", UserWarning)
                continue
        
        
        # If no valid samples in batch, create a minimal dummy batch
        # This prevents crashes when all images in a batch are missing
        if len(images) == 0 or len(texts) == 0:
            # Create a dummy batch with proper formatting
            dummy_image = torch.zeros((3, 224, 224), dtype=torch.uint8)
            from PIL import Image as PILImage
            dummy_pil = PILImage.fromarray(dummy_image.permute(1, 2, 0).numpy().astype('uint8'))
            
            # Create a dummy message with image token using chat template
            dummy_messages = [{
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": ""}
                ]
            }]
            dummy_text = processor.apply_chat_template(
                dummy_messages,
                add_generation_prompt=False,
                tokenize=False
            ).strip()
            
            batch = processor(
                text=[dummy_text],
                images=[[dummy_pil]],
                return_tensors="pt",
                padding=True,
                truncation=True
            )
            # Set labels to all -100 so this sample is ignored in loss
            batch["labels"] = torch.full_like(batch["input_ids"], -100)
            return batch
        
        # Tokenize and process
        batch = processor(
            text=texts,
            images=images,
            return_tensors="pt",
            padding=True,
            truncation=True
        )
        
        # Create labels (mask padding and image tokens)
        labels = batch["input_ids"].clone()
        
        # Get special token IDs
        pad_token_id = processor.tokenizer.pad_token_id
        image_token_id = processor.tokenizer.convert_tokens_to_ids(
            processor.tokenizer.special_tokens_map.get("boi_token", "<image>")
        )
        
        # Mask padding and special tokens
        labels[labels == pad_token_id] = -100
        labels[labels == image_token_id] = -100
        labels[labels == 262144] = -100  # Additional special token
        
        batch["labels"] = labels
        return batch
    
    return collate_fn


def setup_model_and_processor(config: TrainingConfig):
    """Initialize model and processor with quantization"""
    print(f"Loading model: {config.model_id}")
    
    # Check GPU capability
    if torch.cuda.is_available():
        capability = torch.cuda.get_device_capability()
        print(f"GPU Compute Capability: {capability}")
        if capability[0] < 8:
            print("WARNING: GPU does not support bfloat16 optimally")
    
    # Load model in bfloat16 (no quantization for distributed training compatibility)
    model = AutoModelForImageTextToText.from_pretrained(
        config.model_id,
        attn_implementation="eager",
        torch_dtype=torch.bfloat16,
    )
    
    # Load processor
    processor = AutoProcessor.from_pretrained(config.model_id)
    processor.tokenizer.padding_side = "right"
    
    # Setup LoRA
    lora_config = LoraConfig(
        r=config.lora_r,
        lora_alpha=config.lora_alpha,
        lora_dropout=config.lora_dropout,
        bias="none",
        target_modules="all-linear",
        task_type="CAUSAL_LM",
    )
    
    # Apply LoRA
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    
    return model, processor


def compute_metrics_fn(eval_preds, processor):
    """Compute metrics during evaluation"""
    predictions, labels = eval_preds
    
    # Decode predictions and labels
    decoded_preds = processor.batch_decode(predictions, skip_special_tokens=True)
    
    # Replace -100 in labels as we can't decode them
    labels = np.where(labels != -100, labels, processor.tokenizer.pad_token_id)
    decoded_labels = processor.batch_decode(labels, skip_special_tokens=True)
    
    # Compute metrics
    from rouge_score import rouge_scorer
    scorer = rouge_scorer.RougeScorer(['rouge1', 'rouge2', 'rougeL'], use_stemmer=True)
    
    rouge1_scores = []
    rouge2_scores = []
    rougeL_scores = []
    
    for pred, label in zip(decoded_preds, decoded_labels):
        scores = scorer.score(label, pred)
        rouge1_scores.append(scores['rouge1'].fmeasure)
        rouge2_scores.append(scores['rouge2'].fmeasure)
        rougeL_scores.append(scores['rougeL'].fmeasure)
    
    return {
        'rouge1': np.mean(rouge1_scores),
        'rouge2': np.mean(rouge2_scores),
        'rougeL': np.mean(rougeL_scores),
    }


def train(config: TrainingConfig):
    """Main training function"""
    # Setup WandB
    setup_wandb(config)
    
    # Load dataset
    train_dataset, eval_dataset = load_and_prepare_dataset(config)
    
    # Setup model and processor
    model, processor = setup_model_and_processor(config)
    
    # Create data collator
    data_collator = create_data_collator(processor, config)
    
    # Training arguments
    training_args = SFTConfig(
        output_dir=config.output_dir,
        num_train_epochs=config.num_train_epochs,
        per_device_train_batch_size=config.per_device_train_batch_size,
        per_device_eval_batch_size=config.per_device_eval_batch_size,
        gradient_accumulation_steps=config.gradient_accumulation_steps,
        gradient_checkpointing=config.gradient_checkpointing,
        optim=config.optim,
        learning_rate=config.learning_rate,
        max_grad_norm=config.max_grad_norm,
        warmup_ratio=config.warmup_ratio,
        weight_decay=config.weight_decay,
        lr_scheduler_type=config.lr_scheduler_type,
        logging_steps=config.logging_steps,
        save_strategy="steps",
        save_steps=config.save_steps,
        save_total_limit=config.save_total_limit,
        eval_strategy="steps",
        eval_steps=config.eval_steps,
        bf16=config.bf16,
        tf32=True,
        dataloader_num_workers=config.dataloader_num_workers,
        remove_unused_columns=False,
        label_names=["labels"],
        report_to="wandb",
        run_name=config.wandb_run_name,
        push_to_hub=False,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        dataset_kwargs={"skip_prepare_dataset": True},
        ddp_find_unused_parameters=False,
        deepspeed=config.deepspeed,  # Enable DeepSpeed ZeRO-3
    )
    
    # Initialize trainer
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        processing_class=processor,
        data_collator=data_collator,
    )
    
    # Train
    print("\n" + "="*50)
    print("Starting training...")
    print("="*50 + "\n")
    
    train_result = trainer.train()
    
    # Save final model
    print("\nSaving final model...")
    trainer.save_model()
    
    # Save training metrics
    metrics = train_result.metrics
    trainer.log_metrics("train", metrics)
    trainer.save_metrics("train", metrics)
    
    print("\n" + "="*50)
    print("Training completed!")
    print("="*50 + "\n")
    
    # Cleanup
    wandb.finish()
    
    return trainer


if __name__ == "__main__":
    # Create configuration
    config = TrainingConfig()
    
    # Start training
    trainer = train(config)
    
    print(f"\nModel saved to: {config.output_dir}")
    print("Training artifacts saved successfully!")