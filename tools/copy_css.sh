#!/bin/bash

cssdir="./dist/css"
echo "Check: exsiting directory $cssdir"
if [ -e "$cssdir" ] && ! [ -d "$cssdir" ]; then
  echo "Remove: $cssdir file"
  rm -f "$cssdir"
fi
if ! [ -e "$cssdir" ]; then
  echo "Create: $cssdir directory"
  mkdir "$cssdir"
fi
echo "CAUTION: It will be built css from sass."
echo "Copy: ./src/css to ./dist/css"
cp -a ./src/css ./dist
if [ $? -ne 0 ]; then
  echo "Error: copy css"
  exit 1
fi

exit 0
