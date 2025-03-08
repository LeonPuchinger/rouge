# Temporary workaround for installing the latest changes of the ts-parsec library.
# Clones the src, builds the library and copies the built files to the node_modules directory.
# TODO: Remove this script if changes are ever merged onto main in ts-parsec.
if [ -d "node_modules/typescript-parsec" ]; then
    rm -rf node_modules/typescript-parsec
fi
mkdir node_modules/typescript-parsec
degit leonpuchinger/ts-parsec-stateful-lexer#stateful-lexer node_modules/typescript-parsec/src
cd node_modules/typescript-parsec/src
yarn
yarn build
cd ..
cp -r src/packages/ts-parsec/lib/* .
rm -rf src
