#!/bin/sh
set -e

# Start Ollama server in the background
ollama serve &
# Wait for it to initialize
sleep 10
# Pull Llama 2 model
ollama pull llama2
# Keep container running
wait   
