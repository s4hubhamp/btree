//TODO: we seem to be having a problem with duplicate keys, can we get around the strict criteria?? Relook at assumptions
// this is because we are strictly ensuring(and thus assuming) that all nodes to the left are less than or equal and all on right
// are lesser, this does not play well with duplicates

// for checking for duplicates before insertion we can just go and find the leaf where the key should've been present
// and then we will simply search one node to check whether key exists or not. If it does exist then we can throw duplicate key exception
// this is written so that we don't do search first and try to insert later, because that would double the effort

function assert(trueOrFalse: any, message?: string) {
  if (Boolean(trueOrFalse) === false) {
    console.error(message ?? 'Assertion Failed');
    process.exit(1);
  }
}
console.assert = assert;

export type Key = number;
export type Value = any;

type InternalNode = {
  keys: Array<Key>;
  children: Array<Node>;
};

type LeafNode = {
  keys: Array<Key>;
  values: Array<Value>;
  left: LeafNode | null;
  right: LeafNode | null;
};

type Node = InternalNode | LeafNode;

export type Btree = {
  root: Node;
  max_keys_per_inner_node: number;
  min_keys_per_inner_node: number;
  max_keys_per_leaf_node: number;
  min_keys_per_leaf_node: number;
  height: number;
};

export function init_btree(max_keys_per_inner_node: number, max_keys_per_leaf_node: number): Btree {
  // let's say t is minimum degree of the tree
  // max is 2t - 1
  // min is t - 1

  if (max_keys_per_inner_node < 2 || max_keys_per_leaf_node < 2)
    throw Error('Node should have atleast 2 keys');

  let min_keys_per_inner_node = Math.ceil((max_keys_per_inner_node + 1) / 2) - 1;
  let min_keys_per_leaf_node = Math.ceil((max_keys_per_leaf_node + 1) / 2) - 1;

  return {
    root: create_leaf_node(),
    max_keys_per_inner_node,
    min_keys_per_inner_node,
    max_keys_per_leaf_node,
    min_keys_per_leaf_node,
    height: 1,
  };
}

export function create_internal_node(config?: {
  keys: Array<Key>;
  children: Array<Node>;
  left: InternalNode | null;
  right: InternalNode | null;
}): InternalNode {
  return (
    config ?? {
      keys: [],
      children: [],
      left: null,
      right: null,
    }
  );
}

export function create_leaf_node(config?: {
  keys: Array<Key>;
  values: Array<Value>;
  left: LeafNode | null;
  right: LeafNode | null;
}): LeafNode {
  return (
    config ?? {
      keys: [],
      values: [],
      left: null,
      right: null,
    }
  );
}

// Type guard to check if a node is a leaf
function is_leaf(node: Node): node is LeafNode {
  return (node as LeafNode).values !== undefined;
}

// inserts the node into btree and then returns new root
// the left child of a node will contain keys which are less than or equal to nodes key and right will have keys greater than nodes key
export function insert(tree: Btree, key: Key, value: Value) {
  const { leafNode, parentsWithChildIdxes } = search_node(tree.root, key);

  // first time insertion happens at leaf node so no children are there
  insert_into_leaf_node(leafNode, key, value);

  // balancing if overflow happens
  const newRoot = balance_insertion(tree, leafNode, parentsWithChildIdxes);
  if (newRoot) {
    tree.root = newRoot;
    tree.height++;
  }
}

// splits the internal or leaf node
// when splitting a leaf node we need to keep the copy of the pivot
// So keep a copy of the pivot and split the node in a way that keys less than or equal are always on left of the pivot
// when splitting a internal node we don't need the copy of it at two levels
//
function split_em_up(tree: Btree, node: Node) {
  // we want to include pivot on the left side so that the keys which are less than or equal to pivot are on left side
  let pivotIndex = Math.floor(node.keys.length / 2); // left-biased
  let pivotKey = node.keys[pivotIndex];

  let left: Node, right: Node;

  // when we split leaf node we want to keep pivot on the left side and
  // when splitting internal node we don't need to keep pivot
  if (is_leaf(node)) {
    left = create_leaf_node({
      keys: node.keys.slice(0, pivotIndex + 1),
      values: node.values.slice(0, pivotIndex + 1),
      left: null,
      right: null,
    });

    right = create_leaf_node({
      keys: node.keys.slice(pivotIndex + 1),
      values: node.values.slice(pivotIndex + 1),
      left: null,
      right: null
    });

    left.left = node.left;
    left.right = right;
    right.left = left;
    right.right = node.right;
  
    if (node.left) {
      node.left.right = left;
    }
  
    if (node.right) {
      node.right.left = right;
    }

    console.assert(left.keys.length >= tree.min_keys_per_leaf_node, 'We fucked up in splitting');
    console.assert(right.keys.length >= tree.min_keys_per_leaf_node, 'We fucked up in splitting');
  } else {
    left = create_internal_node({
      keys: node.keys.slice(0, pivotIndex),
      children: node.children.slice(0, pivotIndex + 1),
      left: null,
      right: null,
    });

    right = create_internal_node({
      keys: node.keys.slice(pivotIndex + 1),
      children: node.children.slice(pivotIndex + 1),
      left: null,
      right: null,
    });

    console.assert(left.keys.length >= tree.min_keys_per_inner_node, 'We fucked up in splitting');
    console.assert(right.keys.length >= tree.min_keys_per_inner_node, 'We fucked up in splitting');
  }

  return { pivotKey, left, right };
}

// balance and return if there is new root of the tree
// it returns undefined if we don't create any new root
function balance_insertion(
  tree: Btree,
  node: Node, // the node we are balancing
  parentsWithChildIdxes: ParentsWithChildIdxes,
  previousSplitData?: { pivotKey: Key; insertAt: number, left: Node; right: Node }
): Node | undefined {
  if (previousSplitData) {
    //? this is runtime check, can we avoid it?
    if (is_leaf(node)) throw Error('why the fuck previousSplitData is being inserted into leaf node?');
    insert_into_internal_node(
      node,
      previousSplitData.insertAt,
      previousSplitData.pivotKey,
      previousSplitData.left,
      previousSplitData.right
    );
  }

  // check if we need to split the node
  if (is_leaf(node) && node.keys.length <= tree.max_keys_per_leaf_node) {
    return undefined;
  } else if (node.keys.length <= tree.max_keys_per_inner_node) {
    return undefined;
  }

  let isRoot = !parentsWithChildIdxes.length;
  let { left, right, pivotKey } = split_em_up(tree, node);

  if (isRoot) {
    // create new root by creating new internal node
    const newRoot = create_internal_node({
      keys: [pivotKey],
      children: [left, right],
      left: null,
      right: null,
    });

    return newRoot;
  }

  // send the pivot to parent
  const { parent: nextNode, childIdx: insertAt } = parentsWithChildIdxes.pop()!;
  return balance_insertion(tree, nextNode, parentsWithChildIdxes, { pivotKey, insertAt, left, right });
}

//* This is called by balance when we are doing the insertion inside the non leaf node
//* Balance will call this to insert a pivot into parent after splitting
// since this is being called on parent we also need to delete the old outdated reference of the child node that was split before calling this function
function insert_into_internal_node(node: InternalNode, insertAt: number, key: Key, left: Node, right: Node) {
  // make space for new element inside the array
  node.keys.push(0);

  // rearrange
  for (let i = node.keys.length - 1; i > insertAt; i--) {
    node.keys[i] = node.keys[i - 1];
  }
  node.keys[insertAt] = key;

  //* removing the old reference and add new left, right
  node.children.splice(insertAt, 1, left, right);
}

// inserts the key and value in leaf node with overflow
function insert_into_leaf_node(node: LeafNode, key: Key, value: Value) {
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

type ParentsWithChildIdxes = { parent: InternalNode; childIdx: number }[];
// insert/delete will always happen at leaf node
// if value X is *less than or equal* to some internal node then search progresses towards left child
// if value X is *greater* than some internal node then search progresses towards right child
function search_node(
  root: Node,
  key: Key
): { leafNode: LeafNode; parentsWithChildIdxes: ParentsWithChildIdxes } {
  const parentsWithChildIdxes = [];
  while (!is_leaf(root)) {
    let childIdx = binary_search(root, key);
    parentsWithChildIdxes.push({ parent: root, childIdx });
    root = root.children[childIdx];
  }
  return { leafNode: root, parentsWithChildIdxes };
}

// while our tree can have multiple occurrences for same key, we will delete first one that we find
export function delete_key(tree: Btree, key: Key) {
  const { leafNode, parentsWithChildIdxes } = search_node(tree.root, key);

  // we can just do delete as we don't need to adjust any children references since this is a leaf
  if (!delete_from_leaf_node(leafNode, key)) {
    return false;
  }

  const rootIsLeaf = !parentsWithChildIdxes.length;
  if (rootIsLeaf) {
    // no balancing is needed
    return;
  }

  const { childIdx, parent } = parentsWithChildIdxes.pop()!;
  const newRoot = balance_deletion(tree, parent, childIdx, parentsWithChildIdxes);
  if (newRoot) {
    tree.root = newRoot;
    tree.height--;
  }
}

// try stealing from left then right
// if we can't steal, that is siblings already has minimum keys we will return false indicating we didn't steal any
function steal(tree: Btree, parentNode: InternalNode, childIdx: number) {
  const childNode = parentNode.children[childIdx];
  const leftSibling = childIdx > 0 ? parentNode.children[childIdx - 1] : undefined;
  const rightSibling = childIdx < parentNode.children.length - 1 ? parentNode.children[childIdx + 1] : undefined;

  // can we steal from left
  if (leftSibling && leftSibling.keys.length > tree.min_keys_per_inner_node) {
    const parentKeyIndex = getParentKeyIndexWhenSiblingIsOnLeft(childIdx);
    if (is_leaf(childNode)) {
      const key = leftSibling.keys.pop()!,
      // @ts-ignore
      value = leftSibling.values.pop()!;
      // insert key and value at start
      childNode.keys.unshift(key);
      childNode.values.unshift(value);
      // since right can't have keys bigger than parent update parent
      parentNode.keys[parentKeyIndex] = leftSibling.keys.at(-1)!;
    } else {
      // select the parent key as the new key
      const key =  parentNode.keys[parentKeyIndex]!;
      // @ts-ignore
      const child = leftSibling.children.pop()!;
      // insert key and children at start
      childNode.keys.unshift(key);
      childNode.children.unshift(child);
      // once the child on left comes to right, parent key has to be reset because left child will bring all the smaller keys than parent
      // we will pick the removed key as new parent key because all the children we just moved were greater than it
      parentNode.keys[parentKeyIndex] = leftSibling.keys.pop()!; //* Note that we are also removing it from left
    }
  }

  // can we steal from right
  else if ( rightSibling && rightSibling.keys.length > tree.min_keys_per_inner_node) {
    const parentKeyIndex = getParentKeyIndexWhenSiblingIsOnRight(childIdx);

    if (is_leaf(childNode)) {
      const key = rightSibling.keys.shift()!,
      // @ts-ignore
        value = rightSibling.values.shift()!;
      childNode.keys.push(key);
      childNode.values.push(value);
      // since the left side has keys less than or equal, update the parent Key
      parentNode.keys[parentKeyIndex] = key!;
    } else {
      // select the parent key as the new key
      const key = parentNode.keys[parentKeyIndex]!;
      // @ts-ignore
      const child = rightSibling.children.shift()!;
      // insert at last
      childNode.keys.push(key);
      childNode.children.push(child);
      // once the child on right comes to left, parent key has to be reset because right child will bring all the bigger keys than parent
      // we will pick the removed key because all the children we just moved were lesser than equal to it
      parentNode.keys[parentKeyIndex] = rightSibling.keys.shift()!; //* Note that we are also removing it from right
    }
  } else {
    return false;
  }

  return true;
}

// when we are stealing from left node we need to know about parent key index so that we can update it or remove it
function getParentKeyIndexWhenSiblingIsOnLeft(childIdx: number): number {
  return childIdx - 1;
}

function getParentKeyIndexWhenSiblingIsOnRight(childIdx: number): number {
  return childIdx;
}

function merge(parent: InternalNode, childIdx: number) {
  const childNode = parent.children[childIdx];
  const leftSibling = childIdx > 0 ? parent.children[childIdx - 1] : undefined;
  const rightSibling = childIdx < parent.children.length - 1 ? parent.children[childIdx + 1] : undefined;

  //* Note: This function gets called only if we can't steal from both left and right siblings
  // This means that we already verified that both left and right siblings has min keys and thus they it's safe to merge with them
  // following inequality also holds, one node has t - 1(sibling node) keys and other has t - 2(node at childIdx) keys
  // so the following inequality is holds ===> (t - 1) + (t - 2) <= 2t - 1

  //* Note: When merging the leaf nodes we merge the siblings and then remove the key from parent because number of children reduced
  // whereas when merging the internal nodes we merge siblings and number of children didn't reduce. That's why we have to add new key from parent into merge result

  // can we merge with left
  if (is_leaf(childNode)) {
    // merge with left
    if (leftSibling) {
      // merge current node with the left node
      leftSibling.keys = leftSibling.keys.concat(childNode.keys);
      (leftSibling as LeafNode).values = (leftSibling as LeafNode).values.concat(childNode.values);
      // update the pointers
      (leftSibling as LeafNode).right = childNode.right;
      if (childNode.right) childNode.right.left = <LeafNode>leftSibling;

      const parentKeyIndex = getParentKeyIndexWhenSiblingIsOnLeft(childIdx);
      // remove the parent key
      parent.keys.splice(parentKeyIndex, 1);
      // remove current child as it's now merged with left
      parent.children.splice(childIdx, 1);
    }
    // merge with right
    else if (rightSibling) {
      childNode.keys = childNode.keys.concat(rightSibling.keys);
      childNode.values = childNode.values.concat((rightSibling as LeafNode).values);
      // update the pointers
      childNode.right = (rightSibling as LeafNode).right;
      if (childNode.right) childNode.right.left = childNode;
      const parentKeyIndex = getParentKeyIndexWhenSiblingIsOnRight(childIdx);
      // remove the parent key
      parent.keys.splice(parentKeyIndex, 1);
      // remove the right child
      parent.children.splice(childIdx + 1, 1);
    } else {
      throw new Error(`Did not match any if's during merge for leaf node`);
    }
  } else {
    // merge with left
    if (leftSibling) {
      const parentKeyIndex = getParentKeyIndexWhenSiblingIsOnLeft(childIdx);
      // choose parent key as the new key because all nodes to the childIdx.left are going to be smaller than or equal to it
      const newKey = parent.keys[parentKeyIndex];
      // remove parentKey to mark parent unbalanced
      parent.keys.splice(parentKeyIndex, 1);
      // since children remain the same, a newKey will be added in between the left and right keys
      leftSibling.keys = leftSibling.keys.concat([newKey, ...childNode.keys]);
      // add children
      (leftSibling as InternalNode).children = (leftSibling as InternalNode).children.concat(childNode.children);
      // remove right as we have merged with left. right child is current childIdx
      parent.children.splice(childIdx, 1);
    }
    // merge with right
    else if (rightSibling) {
      const parentKeyIndex = getParentKeyIndexWhenSiblingIsOnRight(childIdx);
      // choose parent key as the new key because all nodes to the childIdx.left are going to be smaller than or equal to it
      const newKey = parent.keys[parentKeyIndex]!; 
      // remove a key from parent to mark parent node as unbalanced
      parent.keys.splice(parentKeyIndex, 1);
      // add new key before right keys
      childNode.keys = childNode.keys.concat([newKey, ...rightSibling.keys]);
      // append children
      childNode.children = childNode.children.concat((rightSibling as InternalNode).children);
      // remove right child from parent since it's now merged with left
      parent.children.splice(childIdx + 1, 1);
    } else {
      throw new Error(`Did not match any if's during merge for internal node`);
    }
  }
}

// this only does merging with siblings or merging with parent depending upon whether nodes are leaf or internal
// if merging with sibling is enough then it does otherwise we have to do merging with parent. (Note: merging with parent is only available for leaf nodes)
function balance_deletion(
  tree: Btree,
  parent: InternalNode,
  childIdx: number,
  parentsWithChildIdxes: { parent: InternalNode; childIdx: number }[] // parents of parentNode
): Node | undefined {
  const childNode = parent.children[childIdx];

  // check if node is already balanced
  let isNodeBalanced;
  if (is_leaf(childNode)) { 
    if(childNode.keys.length >= tree.min_keys_per_leaf_node) { isNodeBalanced = true; }
    else { isNodeBalanced = false; }
  } else {
    if (childNode.keys.length >= tree.min_keys_per_inner_node) { isNodeBalanced = true }
    else { isNodeBalanced = false }
  }

  if (!isNodeBalanced) {
    // first we try to steal and if stealing fails then we will merge
    if (steal(tree, parent, childIdx) === false) {
      // otherwise need to merge
      merge(parent, childIdx);
    } else {
      // after stealing we are done with balancing
      return undefined;
    }
  }

  const isRoot = !parentsWithChildIdxes.length;
  // if we are at root
  if (isRoot) {
    // after merge happens root may become empty when we perform internal node's merger
    // when root becomes empty there will be only one child node in parent and that node will become new root
    if (!parent.keys.length) {
      console.assert(
        parent.children.length === 1,
        `Root is empty but parent.children.length is ${parent.children.length}`
      );
      const newRoot = parent.children[0];
      return newRoot;
    }

    //* root will not remain unbalanced by the time control reaches here
    return undefined;
  }

  const nextParent = parentsWithChildIdxes.at(-1)?.parent!;
  const nextChildIdx = parentsWithChildIdxes.at(-1)?.childIdx!;
  parentsWithChildIdxes.pop();
  return balance_deletion(tree, nextParent, nextChildIdx, parentsWithChildIdxes);
}

function delete_from_leaf_node(node: LeafNode, key: Key): boolean {
  const keyIndex = binary_search(node, key);

  // if index is out of bounds
  if (keyIndex >= node.keys.length || keyIndex < 0) {
    return false;
  } else if (node.keys[keyIndex] === key) {
    node.keys.splice(keyIndex, 1);
    node.values.splice(keyIndex, 1);
    return true;
  }

  return false;
}

// search the node @see insert for how the data is arranged
export function search(root: Node, key: Key): Value | undefined {
  let index = binary_search(root, key);

  if (is_leaf(root)) {
    // if index is out of bounds
    if (index < 0 || index >= root.keys.length) {
      return undefined;
    } else if (root.keys[index] === key) {
      return root.values[index];
    } else {
      return undefined;
    }
  } else {
    // we will continue to go downwards
    return search(root.children[index], key);
  }
}

// uses bfs to print the tree, uses pointers right pointer to traverse level
// this does not gaurantees that tree is valid, to check validity see `validate_tree`
export function print_tree(tree: Btree, str?: string) {
  str && console.log(str);

  const queue = [{node: tree.root, level: 1}];
  
  let txt = `----------------------------------------------------------------------------------
  h = ${tree.height}`;

  let lastPrintedLevel = 0;
  while (queue.length) {
    const {node, level} = queue.shift()!;

    if(level > lastPrintedLevel) {
      txt += `\n${level} --  `;
      lastPrintedLevel++;
    }

    let content = [];
    for (let i = 0; i < node.keys.length; i++) {
      if (is_leaf(node)) {
        content.push(`${node.keys[i]}`);
        // content.push(`(${node.keys[i]},${node.values[i]})`);
      } else {
        content.push(`${node.keys[i]}`);
      }
    }

    if(!is_leaf(node)) queue.push(...node.children.map(c => ({node: c, level: level + 1})));
    txt += ` [${content.join(',')}]`;
  }

  console.log(txt);
  console.log('----------------------------------------------------------------------------------');
}

export function validate_tree(tree: Btree) {
  // tree metadata
  console.assert(
    tree.max_keys_per_leaf_node >= 2 && tree.max_keys_per_leaf_node >= 2,
    'tree.max_keys_per_leaf_node >= 2 && tree.max_keys_per_leaf_node >= 2'
  );
  console.assert(
    tree.min_keys_per_inner_node >= 1 && tree.min_keys_per_leaf_node >= 1,
    'tree.min_keys_per_inner_node >= 1 && tree.min_keys_per_leaf_node >= 1'
  );
  console.assert(
    tree.min_keys_per_inner_node <= tree.max_keys_per_inner_node,
    'tree.min_keys_per_inner_node <= tree.max_keys_per_inner_node'
  );
  console.assert(
    tree.min_keys_per_leaf_node <= tree.max_keys_per_leaf_node,
    'tree.min_keys_per_leaf_node <= tree.max_keys_per_leaf_node'
  );
  console.assert(tree.height >= 1, 'tree.height');

  if (!tree.root.keys.length) {
    console.assert(is_leaf(tree.root), 'if root is empty then it shoud be leaf node');
    return;
  }

  const queue: Array<{
    node: Node;
    level: number;
    min: undefined | number;
    max: undefined | number;
  }> = [
    {
      node: tree.root,
      level: 1,
      min: undefined,
      max: undefined,
    },
  ];

  let maxLvl = 0;
  let firstLeafchecked = false;
  while (queue.length) {
    let { node, level, min, max } = queue.shift()!;
    maxLvl = level;

    for (let keyIdx = 0; keyIdx < node.keys.length; keyIdx++) {
      if (min !== undefined) {
        console.assert(node.keys[keyIdx] > min, `min check failed. level= ${level} max= ${min} key= ${node.keys[keyIdx]}`);
      }
      if (max !== undefined) {
        console.assert(node.keys[keyIdx] <= max, `max check failed. level=${level} max=${max} node.keys=${node.keys} key=${node.keys[keyIdx]}`);
      }

      if (keyIdx - 1 >= 0)
        console.assert(node.keys[keyIdx - 1] <= node.keys[keyIdx], 'keys should be in order');
    }

    if (!is_leaf(node)) {
      if (!Object.is(tree.root, node)) {
        console.assert(
          node.keys.length >= tree.min_keys_per_inner_node,
          'min keys per inner node check failed'
        );
      }

      console.assert(
        node.keys.length <= tree.max_keys_per_inner_node,
        'max keys per inner node check failed'
      );
      console.assert(
        node.children.length === node.keys.length + 1,
        'children.length should be equal to keys.length + 1'
      );

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if(is_leaf(child)) {
          // check pointers
          if(i > 0) console.assert(Object.is(child.left, node.children[i-1]), 'left link is incorrect');
          if(i < node.children.length - 1) console.assert(Object.is(child.right, node.children[i+1]), 'right link is incorrect');
        }

        console.assert(!!child, 'invalid children node');

        const leftParentKeyIdx = i - 1;
        const rightParentKeyIdx = i;
        // for this child the min value allowed for keys is 1 plus the left parent key (because all right child values should be greater)
        const _min = node.keys[leftParentKeyIdx] !== undefined ? node.keys[leftParentKeyIdx] : min;
        // for this child the max allowed key is equal to right parent key (because all keys left to the parent should be less than or equal)
        const _max = node.keys[rightParentKeyIdx] !== undefined ? node.keys[rightParentKeyIdx] : max;

        // console.log(`level ${level+1} for child ${
        //   node.children[i].keys
        // } all nodes should be greater than ${_min} and all nodes should be less than or equal to ${_max}`);

        queue.push({
          node: child,
          min: _min,
          max: _max,
          level: level + 1,
        });
      }
    } else {
      if (!Object.is(tree.root, node)) {
        console.assert(
          node.keys.length >= tree.min_keys_per_leaf_node,
          'min keys per leaf node check failed'
        );
      }

      if(!firstLeafchecked) {
        firstLeafchecked = true;
        console.assert(node.left === null, 'for first leaf node left link is incorrect');
      }

      // we will be processing the last leaf if queue is empty
      if(!queue.length) console.assert(node.right === null, 'for last leaf node right link is incorrect');

      console.assert(node.keys.length <= tree.max_keys_per_leaf_node, 'max keys per leaf node check failed');
    }
  }

  console.assert(tree.height === maxLvl, 'tree height is incorrect');
}
