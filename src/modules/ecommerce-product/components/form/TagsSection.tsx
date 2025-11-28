import React from 'react';
import Input from '@/shared/ui/input/Input';
import Label from '@/shared/ui/label/Label';
import Badge from '@/shared/ui/badge/Badge';
import Button from '@/shared/ui/button/Button';
import { Plus, X, Star } from '@/shared/ui/icons/Icons';

interface TagsSectionProps {
  tags: string[];
  newTag: string;
  setNewTag: (tag: string) => void;
  handleTagAdd: () => void;
  handleTagRemove: (tag: string) => void;
  suggestedTags?: string[];
  maxTags?: number;
  placeholder?: string;
  fieldError?: string;
  helpText?: string;
}

export default function TagsSection({
  tags,
  newTag,
  setNewTag,
  handleTagAdd,
  handleTagRemove,
  suggestedTags = [],
  maxTags,
  placeholder = "Add tag...",
  fieldError,
  helpText
}: TagsSectionProps) {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTagAdd();
    }
  };


  const canAddMoreTags = !maxTags || tags.length < maxTags;
  const isAtMaxTags = maxTags && tags.length >= maxTags;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center">
          <Star className="h-5 w-5 mr-2 text-purple-600" />
          Tags
        </h3>
        {maxTags && (
          <Badge variant="light" color="light" className="text-xs">
            {tags.length}/{maxTags}
          </Badge>
        )}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="tags">Product Tags</Label>
        {helpText && (
          <p className="text-sm text-gray-600 dark:text-gray-400">{helpText}</p>
        )}
        
        <div className="flex gap-2">
          <Input
            id="tags"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            disabled={Boolean(isAtMaxTags)}
            className={fieldError ? 'border-red-500' : ''}
          />
          <Button 
            type="button" 
            onClick={handleTagAdd} 
            size="sm"
            disabled={!canAddMoreTags || !newTag.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        
        {fieldError && (
          <p className="text-sm text-red-600 dark:text-red-400">{fieldError}</p>
        )}
        
        {isAtMaxTags && (
          <p className="text-sm text-orange-600 dark:text-orange-400">
            Maximum number of tags reached ({maxTags})
          </p>
        )}
        
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag, index) => (
              <div
                key={index}
                className="cursor-pointer"
                onClick={() => handleTagRemove(tag)}
              >
                <Badge
                  variant="light"
                  color="light"
                  className="flex items-center gap-1"
                  endIcon={<X className="h-3 w-3" />}
                >
                  {tag}
                </Badge>
              </div>
            ))}
          </div>
        )}
        
        {/* Suggested Tags */}
        {suggestedTags.length > 0 && canAddMoreTags && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Suggested Tags
            </h4>
            <div className="flex flex-wrap gap-2">
              {suggestedTags
                .filter(tag => !tags.includes(tag))
                .slice(0, 8) // Limit to 8 suggestions
                .map((tag, index) => (
                <div
                  key={index}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => {
                    setNewTag(tag);
                    handleTagAdd();
                  }}
                >
                  <Badge
                    variant="light"
                    color="primary"
                    className="hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                    endIcon={<Plus className="h-3 w-3" />}
                  >
                    {tag}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}