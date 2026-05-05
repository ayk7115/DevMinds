#!/bin/bash
PROMPT=$(cat "/mnt/c/Users/lenovo/Desktop/DevMinds/src/agent/temp_prompt.txt")
"/home/aadi/.nvm/versions/node/v22.22.2/bin/node" "/home/aadi/.nvm/versions/node/v22.22.2/bin/openclaw" infer model run --local --model ollama/llama3 --prompt "$PROMPT"
