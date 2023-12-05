#!/bin/bash

echo "building distributable ESNext modules..."
[ -d "node_modules" ] && rm -r "node_modules"
npm install
npm run build
