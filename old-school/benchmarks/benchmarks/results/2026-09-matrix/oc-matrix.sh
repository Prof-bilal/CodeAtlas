#!/bin/bash
cd /home/bilal/CodeAtlas
CLI=apps/cli/dist/index.js
for m in mimo:opencode/mimo-v2.5-free bigpickle:opencode/big-pickle nemotron:opencode/nemotron-3.5-lightning-free; do
  ml=${m%%:*}
  for r in winston:repo-01 commander:repo-02 axios:repo-03 rxjs:repo-04; do
    rl=${r%%:*}; repo=${r##*:}
    echo "=== oc-$ml-$rl start $(date -Iseconds) ==="
    node $CLI benchmark run oc-$ml-$rl --repo benchmarks/final-2026-08/repos/$repo
    echo "=== oc-$ml-$rl done $(date -Iseconds) exit=$? ==="
  done
done
echo "OC MATRIX COMPLETE" > /home/bilal/CodeAtlas/benchmarks/results/2026-09-matrix/oc-matrix.flag
