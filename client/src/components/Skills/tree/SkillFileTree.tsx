import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { Tree } from 'react-arborist';
import type { TSkillNode } from 'librechat-data-provider';
import type { NodeApi } from 'react-arborist';
import type { SkillTreeData } from './SkillTreeNode';
import SkillTreeNode, { TreeActionsContext } from './SkillTreeNode';
import { useLocalize } from '~/hooks';

interface SkillFileTreeProps {
  nodes: TSkillNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string, nodeType: 'file' | 'folder') => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onMoveNode: (nodeId: string, newParentId: string | null, index: number) => void;
  onDeleteNode: (nodeId: string) => void;
  height?: number;
}

function buildTreeData(nodes: TSkillNode[]): SkillTreeData[] {
  const nodeMap = new Map<string, SkillTreeData>();
  const roots: SkillTreeData[] = [];

  for (const node of nodes) {
    nodeMap.set(node._id, {
      id: node._id,
      name: node.name,
      nodeType: node.type,
      fileId: node.fileId,
      children: node.type === 'folder' ? [] : undefined,
    });
  }

  for (const node of nodes) {
    const treeNode = nodeMap.get(node._id);
    if (!treeNode) {
      continue;
    }

    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent?.children) {
        parent.children.push(treeNode);
      } else {
        roots.push(treeNode);
      }
    } else {
      roots.push(treeNode);
    }
  }

  return roots;
}

export default function SkillFileTree({
  nodes,
  selectedNodeId,
  onSelectNode,
  onRenameNode,
  onMoveNode,
  onDeleteNode,
  height,
}: SkillFileTreeProps) {
  const localize = useLocalize();
  const treeData = useMemo(() => buildTreeData(nodes), [nodes]);
  const treeActions = useMemo(() => ({ onDeleteNode }), [onDeleteNode]);
  const treeLabel = localize('com_ui_skill_files');

  const handleSelect = useCallback(
    (selectedNodes: NodeApi<SkillTreeData>[]) => {
      const selected = selectedNodes[0];
      if (selected) {
        onSelectNode(selected.id, selected.data.nodeType);
      }
    },
    [onSelectNode],
  );

  const handleRename = useCallback(
    ({ id, name }: { id: string; name: string; node: NodeApi<SkillTreeData> }) => {
      onRenameNode(id, name);
    },
    [onRenameNode],
  );

  const handleMove = useCallback(
    ({
      dragIds,
      parentId,
      index,
    }: {
      dragIds: string[];
      dragNodes: NodeApi<SkillTreeData>[];
      parentId: string | null;
      parentNode: NodeApi<SkillTreeData> | null;
      index: number;
    }) => {
      for (const id of dragIds) {
        onMoveNode(id, parentId, index);
      }
    },
    [onMoveNode],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const rowHeight = 34;
  const resolvedHeight = height ?? containerHeight;

  return (
    <TreeActionsContext.Provider value={treeActions}>
      <div
        ref={(el) => {
          containerRef.current = el;
          if (el) {
            const inner = el.querySelector('[role="tree"]');
            if (inner && !inner.getAttribute('aria-label')) {
              inner.setAttribute('aria-label', treeLabel);
            }
          }
        }}
        className="size-full px-2"
      >
        <Tree<SkillTreeData>
          data={treeData}
          selection={selectedNodeId ?? undefined}
          onSelect={handleSelect}
          onRename={handleRename}
          onMove={handleMove}
          rowHeight={rowHeight}
          indent={16}
          width="100%"
          height={resolvedHeight}
          openByDefault={false}
        >
          {SkillTreeNode}
        </Tree>
      </div>
    </TreeActionsContext.Provider>
  );
}
