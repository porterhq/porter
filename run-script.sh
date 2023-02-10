#!/bin/bash

##
# a patch script as a workaround of <https://github.com/npm/rfcs/issues/575>
# should be replaced by `npm run --workspaces --if-present --short-circut` when the issue is resolved

set -e

npm run pretest
for workspace in $(ls -d packages/* examples/*); do
  npm run $1 --workspace ./${workspace} --if-present
done
