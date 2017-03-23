#!/bin/bash

echo "Copy: ./src/img to ./dist/img"
cp -a ./src/img ./dist
if [ $? -ne 0 ]; then
  echo "Error: copy img"
  exit 1
fi

echo "Copy: ./src/_locales to ./dist/_locales"
cp -a ./src/_locales ./dist
if [ $? -ne 0 ]; then
  echo "Error: copy _locales"
  exit 1
fi

echo "Copy: ./src/template to ./dist/template"
cp -a ./src/template ./dist
if [ $? -ne 0 ]; then
  echo "Error: copy template"
  exit 1
fi

echo "Copy: ./src/*.html to ./dist/"
cp ./src/*.html ./dist
if [ $? -ne 0 ]; then
  echo "Error: copy html files"
  exit 1
fi

echo "Copy: ./LICENSE to ./dist/"
cp ./LICENSE ./dist
if [ $? -ne 0 ]; then
  echo "Error: copy LICENSE"
  exit 1
fi

echo "Copy: ./src/manifest.json to ./dist/"
cp ./src/manifest.json ./dist
if [ $? -ne 0 ]; then
  echo "Error: copy manifest.json"
  exit 1
fi

exit 0
