#!/bin/bash

##
# a patch script as a workaround of <https://github.com/npm/rfcs/issues/575>
# should be replaced by `npm run --workspaces --if-present --short-circut` when the issue is resolved

set -e

for file in $(ls packages | grep -v packages); do
  npm run $1 --workspace ./packages/${file} --if-present
done
