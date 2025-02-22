const MAX_DEGREE = 4; // Maximum number of children a internal node can have
const MAX_KEYS_PER_NODE = MAX_DEGREE - 1;

type Key = number;
type Value = number;

type Node = {
  keys: Array<Key>;
  values: Array<Value>;
  children: Array<Node>;
};

function create_btree_node(keys?: Array<Key>, values?: Array<Value>, children?: Array<Node>): Node {
  return {
    keys: keys ? keys : [],
    values: values ? values : [],
    children: children ? children : [],
  };
}

function is_leaf(root: Node) {
  return root.children.length === 0;
}

// inserts the node into btree and then returns new root
function insert(root: Node, key: Key, value: Value): Node {
  let { node, parents } = search_node_for_insertion(root, key, []);

  console.assert(
    is_leaf(node) === true,
    'In insert function search_node_for_insertion returned non leaf node'
  );

  // first time insertion happens at leaf node so no children are there
  insert_leaf_node(node, key, value);

  // balancing if overflow happens
  return balance(node, parents) ?? root;
}

// balance and return if there is new root of the tree
function balance(
  node: Node,
  parents: Array<Node>,
  previousSplitData?: { pivotKey: Key; pivotVal: Value; left: Node; right: Node }
): Node | undefined {
  if (previousSplitData) {
    insert_child_node(
      node,
      previousSplitData.pivotKey,
      previousSplitData.pivotVal,
      previousSplitData.left,
      previousSplitData.right
    );
  }

  // we don't need any rebalancing
  //* Important
  if (node.keys.length <= MAX_KEYS_PER_NODE) return undefined;

  let isLeaf = is_leaf(node);

  // split the node
  let pivotIndex = Math.floor(node.keys.length / 2); // left-biased
  // let pivotIndex = Math.floor((node.keys.length - 1) / 2); // right-biased
  let pivotKey = node.keys[pivotIndex];
  let pivotVal = node.values[pivotIndex];

  let left = create_btree_node();
  let right = create_btree_node();

  for (let i = 0; i < pivotIndex; i++) {
    left.keys.push(node.keys[i]);
    left.values.push(node.values[i]);
  }
  if (!isLeaf) left.children = node.children.slice(0, pivotIndex + 1);

  for (let i = pivotIndex + 1; i < node.keys.length; i++) {
    right.keys.push(node.keys[i]);
    right.values.push(node.values[i]);
  }
  if (!isLeaf) right.children = node.children.slice(pivotIndex + 1);

  // if we are already at root
  if (parents.length === 0) {
    // need to create new root node
    const newRoot = create_btree_node([pivotKey], [pivotVal], [left, right]);
    return newRoot;
  }

  // the pivot will propogate to parent
  return balance(parents.pop()!, parents, { pivotKey, pivotVal, left, right });
}

//* This is called by balance when we are doing the insertion inside the non leaf node
//* Balance will call this to insert a pivot into parent after spilit happens
// since this is being called on parent we also need to delete the old outdated reference of the child node that was just split
function insert_child_node(node: Node, key: Key, value: Value, left: Node, right: Node) {
  console.assert(is_leaf(node) === false, 'Why the fuck insert_child_node called on leaf node?');

  let insert_at = binary_search(node, key);

  // make space for new element inside the array
  node.keys.push(0);
  node.values.push(0);

  // rearrange
  for (let i = node.keys.length - 1; i > insert_at; i--) {
    node.keys[i] = node.keys[i - 1];
    node.values[i] = node.values[i - 1];
  }

  node.keys[insert_at] = key;
  node.values[insert_at] = value;

  // step 1: find the insert position
  // step 2: find which child node this new node is coming from
  // step 3: remove reference to old child node as that node was split now and we need to consider new left and right

  // start
  if (insert_at === 0) {
    // the first child was split, hence remove the previous invalid ref
    node.children.shift();
    // set the new references
    node.children.unshift(right);
    node.children.unshift(left);
  }
  // end
  else if (insert_at === node.keys.length - 1) {
    // last child was split, hence remove invalid ref
    node.children.pop();
    // set the new updated references
    node.children.push(left);
    node.children.push(right);
  }
  // middle
  else {
    // the children[insert_at] child was split
    node.children.splice(insert_at, 1, left, right);
  }
}

// inserts the key and value in leaf node
function insert_leaf_node(node: Node, key: Key, value: Value) {
  let insert_at = binary_search(node, key);

  // make space for new element inside the array
  node.keys.push(0);
  node.values.push(0);

  for (let i = node.keys.length - 1; i > insert_at; i--) {
    node.keys[i] = node.keys[i - 1];
    node.values[i] = node.values[i - 1];
  }

  node.keys[insert_at] = key;
  node.values[insert_at] = value;
}

// finds the target index in keys, if not found it retuns the index where the target shoud've been found
function binary_search(root: Node, target: Key) {
  let low = 0,
    high = root.keys.length - 1;
  let mid;

  while (low <= high) {
    mid = Math.floor((low + high) / 2);

    if (root.keys[mid] === target) return mid;

    if (target > root.keys[mid]) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  console.assert(
    low >= 0 && low <= root.keys.length,
    `Unexpected value for low in binary search, num_keys: ${root.keys.length} keys: ${root.keys} low: ${low}`
  );

  return low;
}

// insert will always happen at leaf node
function search_node_for_insertion(root: Node, key: Key, parents: Node[]): { node: Node; parents: Node[] } {
  // initial
  if (root.keys.length === 0) {
    return { node: root, parents };
  }

  // when we reached the leaf
  if (is_leaf(root)) return { node: root, parents };

  let index = binary_search(root, key);
  parents.push(root);
  return search_node_for_insertion(root.children[index], key, parents);
}

function search_node(root: Node | undefined, key: Key): { node: Node; keyIndex: number } | undefined {
  if (!root) return undefined;

  let index = binary_search(root, key);

  // if index in inside bounds
  if (index <= root.keys.length - 1 && root.keys[index] === key) {
    return { node: root, keyIndex: index };
  }

  // we will continue to search downwards
  return search_node(root.children[index], key);
}

//TODO
function delete_key(root: Node, key: Key) {}

// tests
test_inserts_and_search();
function test_inserts_and_search() {
  let k = 1000;
  while (k--) {
    let n = getRandomNumInInterval(1, 1000);
    let root = create_btree_node();
    const map = new Map();

    const min = 1,
      max = 1000;

    for (let i = 1; i <= n; i++) {
      let key = getRandomNumInInterval(min, max);
      // ensure that key is unique
      while (map.has(key)) key = getRandomNumInInterval(min, max);

      let val = getRandomNumInInterval(min, max);
      root = insert(root, key, val);
      map.set(key, val);

      let searchResult = search_node(root, key);
      console.assert(searchResult?.node.values[searchResult?.keyIndex] === val);
    }
  }
}

function getRandomNumInInterval(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
