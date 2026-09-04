#!/bin/bash
cd /home/bilal/CodeAtlas
CLI=apps/cli/dist/index.js
for ml in nemotron minimax stepfun; do
  for rl in winston commander axios rxjs; do
    echo "=== kilo-$ml-$rl start $(date -Iseconds) ==="
    node $CLI benchmark run kilo-$ml-$rl --repo benchmarks/final-2026-08/repos/$rl-repo-fix 2>/dev/null || \
    node $CLI benchmark run kilo-$ml-$rl --repo benchmarks/final-2026-08/repos/$(echo $rl | sed 's/winston/repo-01/;s/commander/repo-02/;s/axios/repo-03/;s/rxjs/repo-04/')
    echo "=== kilo-$ml-$rl done exit=$? $(date -Iseconds) ==="
  done
done
echo "KILO MATRIX COMPLETE" > /home/bilal/CodeAtlas/benchmarks/results/2026-09-matrix/kilo-matrix.flag
