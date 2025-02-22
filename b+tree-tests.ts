import { init_btree, insert, search, delete_key, validate_tree } from './b+tree';
import type { Btree, Key, Value } from './b+tree';

const N = 1000;
console.log(`Correctness tests input size is ${N}`);

logTime('   doing operations in sorted order', () => {
  for(let maxKeys = 2; maxKeys <= 100; maxKeys++) {
    const SortedKeyAndValues = Array.from({ length: N }, (_, i) => ({ key: i + 1, val: i + 1 }));
    const TreeWithSortedInsertions = init_btree(maxKeys, maxKeys);
    test_inserts_and_search({tree: TreeWithSortedInsertions, keyValues: SortedKeyAndValues});
    test_deletes(TreeWithSortedInsertions, SortedKeyAndValues)
  }
});

logTime('   doing operations in random order', () => {
  for(let maxKeys = 2; maxKeys <= 100; maxKeys++) {
    const RandomKeyAndValues = shuffleArr(Array.from({ length: N }, (_, i) => ({ key: i + 1, val: i + 1 })));
    const TreeWithRandomInsertions = init_btree(maxKeys, maxKeys);
    test_inserts_and_search({tree: TreeWithRandomInsertions, keyValues: RandomKeyAndValues});
    shuffleArr(RandomKeyAndValues);
    test_deletes(TreeWithRandomInsertions, RandomKeyAndValues)
  }
});

function test_inserts_and_search({ tree, keyValues }: { tree: Btree; keyValues: { key: Key; val: Value }[] }) {
  for (let { key, val } of keyValues) {
    insert(tree, key, val);
    const s = search(tree.root, key);
    console.assert(s === val);
  }

  validate_tree(tree);
}

function test_deletes(tree: Btree, keyValues: { key: Key; val: Value }[]) {
  for (let i = 0; i < keyValues.length; i++) {
    delete_key(tree, keyValues[i].key);
    console.assert(search(tree.root, keyValues[i].key) === undefined);
    validate_tree(tree);
  }

  console.assert(tree.height === 1 && tree.root.keys.length === 0, 'tree should be empty at this point');
}

///
///
///

console.log('Perf tests');

const InputSize = 100000;
const PerfTestsResults: any = [];
logTime(`Perf tests ${InputSize} input size`, () => {
  const keyAndValues = shuffleArr(
    Array.from({ length: InputSize }, (_, i) => ({ key: i + 1, val: i + 1 }))
  );

  for(let maxKeys = 2; maxKeys <= 1000; maxKeys += 50) {
    const result:any = {MaxKeys: maxKeys};
    const tree = init_btree(maxKeys, maxKeys);
    let startTime = performance.now();
    for (let { key, val } of keyAndValues) insert(tree, key, val);
    let endTime = performance.now();
    result.Height = tree.height;
    result.Insertions = +(endTime - startTime).toFixed(4);

    shuffleArr(keyAndValues);

    // search
    startTime = performance.now();
    for (let { key, val } of keyAndValues) {
      console.assert(search(tree.root, key) === val);
    }
    endTime = performance.now();
    result.Search = +(endTime - startTime).toFixed(4);

    // deletes
    startTime = performance.now();
    for (let { key } of keyAndValues) {
      delete_key(tree, key);
    }
    endTime = performance.now();
    result.Deletes = +(endTime - startTime).toFixed(4);
    console.assert(tree.height === 1 && tree.root.keys.length === 0, `tree should've been empty`);

    PerfTestsResults.push(result);
  };

});

// await Bun.write("profile.json", JSON.stringify(PerfTestsResults));
console.table(PerfTestsResults);

// Function to log time taken by each operation
 function logTime(label: string, callback: any) {
  const startTime = performance.now();
   callback();
  const endTime = performance.now();
  console.log(`${label} took ${(endTime - startTime).toFixed(4)} ms`);
}

function shuffleArr(array: any[]) {
  for (var i = array.length - 1; i > 0; i--) {
    var rand = Math.floor(Math.random() * (i + 1));
    [array[i], array[rand]] = [array[rand], array[i]];
  }
  return array;
}
