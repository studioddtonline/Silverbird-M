#!/bin/bash

echo "Copy: Bootstrap:JS"
cp ./node_modules/bootstrap/dist/js/bootstrap.min.js ./dist/lib/3rdparty
if [ $? -ne 0 ]; then
  echo "Error: Bootstrap:JS"
  exit 1
fi

cssdir="./dist/css/bootstrap"
echo "Check: exsiting directory $cssdir"
if [ -e "$cssdir" ]; then
  echo "Remove: exsiting $cssdir"
  rm -fr "$cssdir"
fi
if ! [ -e "$cssdir" ]; then
  echo "Create: $cssdir directory"
  mkdir "$cssdir"
fi
echo "Copy: Bootstrap:CSS"
cp ./node_modules/bootstrap/dist/css/bootstrap.min.css ./dist/css/bootstrap
if [ $? -ne 0 ]; then
  echo "Error: Bootstrap:CSS"
  exit 1
fi
cp ./node_modules/bootstrap/dist/css/bootstrap-theme.min.css ./dist/css/bootstrap
if [ $? -ne 0 ]; then
  echo "Error: Bootstrap:CSS"
  exit 1
fi

echo "Copy: Bootstrap:Fonts"
cp -a ./node_modules/bootstrap/dist/fonts ./dist/css
if [ $? -ne 0 ]; then
  echo "Error: Bootstrap:Fonts"
  exit 1
fi

exit 0
