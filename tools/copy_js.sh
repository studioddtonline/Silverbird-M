#!/bin/bash

libdir="./dist/lib"
echo "Check: exsiting directory $libdir"
if [ -e "$libdir" ] && ! [ -d "$libdir" ]; then
  echo "Remove: $libdir file"
  rm -f "$libdir"
fi
if ! [ -e "$libdir" ]; then
  echo "Create: $libdir directory"
  mkdir "$libdir"
fi
echo "CAUTION: It will be built javascript files."
echo "Copy: ./src/lib to ./dist/lib"
cp -a ./src/lib ./dist
if [ $? -ne 0 ]; then
  echo "Error: copy lib"
  exit 1
fi
echo "Copy: ./src/sw.js to ./dist/sw.js"
cp -a ./src/sw.js ./dist
if [ $? -ne 0 ]; then
  echo "Error: copy lib"
  exit 1
fi

echo "Copy: jQuery"
cp ./node_modules/jquery/dist/jquery.min.* ./dist/lib/3rdparty
if [ $? -ne 0 ]; then
  echo "Error: copy jQuery"
  exit 1
fi

exit 0
