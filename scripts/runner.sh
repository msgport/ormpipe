#!/bin/bash
#

set -e

BIN_PATH=$(cd "$(dirname "$0")"; pwd -P)
WORK_PATH=${BIN_PATH}/../

${WORK_PATH}/packages/runner/scripts/runner.sh ${@}
