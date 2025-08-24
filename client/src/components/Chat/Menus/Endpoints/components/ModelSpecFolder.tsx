import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import type { TModelSpec } from 'librechat-data-provider';
import { ModelSpecItem } from './ModelSpecItem';
import { cn } from '~/utils';

interface ModelSpecFolderProps {
  folderName: string;
  specs: TModelSpec[];
  selectedSpec: string;
  level?: number;
}

export function ModelSpecFolder({ 
  folderName, 
  specs, 
  selectedSpec,
  level = 0 
}: ModelSpecFolderProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const indent = level * 16;

  return (
    <div className="w-full">
      <button
        onClick={handleToggle}
        className={cn(
          'flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-hover',
          'text-text-secondary transition-colors'
        )}
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        <span className="flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </span>
        <span className="flex-shrink-0">
          {isExpanded ? (
            <FolderOpen className="h-3.5 w-3.5" />
          ) : (
            <Folder className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="truncate text-left font-medium">{folderName}</span>
      </button>
      {isExpanded && (
        <div className="mt-0.5">
          {specs.map((spec) => (
            <div key={spec.name} style={{ paddingLeft: `${indent}px` }}>
              <ModelSpecItem spec={spec} isSelected={selectedSpec === spec.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface GroupedSpecs {
  [folder: string]: TModelSpec[];
}

export function renderModelSpecsWithFolders(specs: TModelSpec[], selectedSpec: string) {
  if (!specs || specs.length === 0) {
    return null;
  }

  // Group specs by folder
  const grouped: GroupedSpecs = {};
  const rootSpecs: TModelSpec[] = [];

  specs.forEach((spec) => {
    if (spec.folder) {
      if (!grouped[spec.folder]) {
        grouped[spec.folder] = [];
      }
      grouped[spec.folder].push(spec);
    } else {
      rootSpecs.push(spec);
    }
  });

  // Sort folders alphabetically
  const sortedFolders = Object.keys(grouped).sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  // Sort specs within each folder by order or label
  sortedFolders.forEach(folder => {
    grouped[folder].sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
    });
  });

  // Sort root specs
  rootSpecs.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
  });

  return (
    <>
      {/* Render folders first */}
      {sortedFolders.map((folder) => (
        <ModelSpecFolder
          key={folder}
          folderName={folder}
          specs={grouped[folder]}
          selectedSpec={selectedSpec}
        />
      ))}
      {/* Render root level specs */}
      {rootSpecs.map((spec) => (
        <ModelSpecItem key={spec.name} spec={spec} isSelected={selectedSpec === spec.name} />
      ))}
    </>
  );
}