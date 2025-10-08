import React from 'react';
import Input from '@/components/ui/input/Input';
import Label from '@/components/ui/label/Label';
import Badge from '@/components/ui/badge/Badge';
import Button from '@/components/ui/button/Button';
import { Plus, X } from '@/components/ui/icons/Icons';

interface TagsSectionProps {
  tags: string[];
  newTag: string;
  setNewTag: (tag: string) => void;
  handleTagAdd: () => void;
  handleTagRemove: (tag: string) => void;
}

export default function TagsSection({
  tags,
  newTag,
  setNewTag,
  handleTagAdd,
  handleTagRemove
}: TagsSectionProps) {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTagAdd();
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Tags</h3>
      
      <div className="space-y-2">
        <Label htmlFor="tags">Product Tags</Label>
        <div className="flex gap-2">
          <Input
            id="tags"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Add tag..."
          />
          <Button type="button" onClick={handleTagAdd} size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag, index) => (
              <Badge
                key={index}
                variant="light"
                color="light"
                className="flex items-center gap-1 cursor-pointer"
                onClick={() => handleTagRemove(tag)}
              >
                {tag}
                <X className="h-3 w-3" />
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}