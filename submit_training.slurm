#!/bin/bash
#SBATCH -J medgemma-ecg-train
#SBATCH -N 1
#SBATCH --ntasks-per-node=32
#SBATCH -p innovp
#SBATCH -t 48:00:00
#SBATCH --gres=gpu:A100-SXM4:8
#SBATCH --output=logs/train_%j.out
#SBATCH --error=logs/train_%j.err

# Job submission script for MedGemma ECGInstruct fine-tuning
# Optimized for 8xA100 40GB GPUs

echo "=========================================="
echo "Job started at: $(date)"
echo "Job ID: $SLURM_JOB_ID"
echo "Node: $SLURM_NODELIST"
echo "=========================================="

# Create logs directory if it doesn't exist
mkdir -p logs

# Load required modules (adjust based on your HPC system)
# Uncomment and modify these lines based on your system's module names
# module purge
# module load cuda/12.1
# module load anaconda3
# module load gcc/11.2.0

# Initialize conda (adjust path if needed)
source $(conda info --base)/etc/profile.d/conda.sh

# Activate conda environment
conda activate airawat

echo "Conda environment activated: $CONDA_DEFAULT_ENV"

# Print environment information
echo ""
echo "Environment Information:"
echo "Python version: $(python3 --version)"
echo "CUDA version: $(nvcc --version | grep release)"
echo "Number of GPUs: $SLURM_GPUS_ON_NODE"
echo "CPUs per task: $SLURM_CPUS_PER_TASK"
echo ""

# Print GPU information
nvidia-smi

# Set environment variables for optimal performance
export OMP_NUM_THREADS=32
export CUDA_VISIBLE_DEVICES=0,1,2,3,4,5,6,7
export NCCL_DEBUG=INFO
export PYTHONUNBUFFERED=1

# No proxy needed - all resources are cached locally

# Hugging Face cache directory (optional - set to a location with enough space)
# export HF_HOME=/path/to/your/hf_cache
# export TRANSFORMERS_CACHE=/path/to/your/hf_cache

echo ""
echo "=========================================="
echo "Starting training..."
echo "=========================================="
echo ""

# Run training with torchrun for multi-GPU
# Option 1: Using torchrun (recommended)
torchrun \
    --nproc_per_node=8 \
    --nnodes=1 \
    --node_rank=0 \
    --master_addr=localhost \
    --master_port=29500 \
    train_medgemma_ecg.py

# Option 2: Using accelerate (alternative - uncomment to use)
# accelerate launch \
#     --multi_gpu \
#     --num_processes=8 \
#     --num_machines=1 \
#     --machine_rank=0 \
#     --main_process_port=29500 \
#     train_medgemma_ecg.py

echo ""
echo "=========================================="
echo "Job completed at: $(date)"
echo "=========================================="
