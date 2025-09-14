"use client";
import React from "react";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Switch from "@/components/form/switch/Switch";
import { ProductData } from "../ProductCreateForm";

interface PublishSettingsProps {
  data: ProductData;
  onUpdate: (updates: Partial<ProductData>) => void;
}

export default function PublishSettings({ data, onUpdate }: PublishSettingsProps) {
  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Publish Settings</h2>
        
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Auto Publish</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Automatically publish to all connected channels
              </p>
            </div>
            <Switch
              checked={data.autoPublish}
              onChange={(autoPublish) => onUpdate({ autoPublish })}
            />
          </div>

          <div>
            <Label>Scheduled Publish Date</Label>
            <Input
              type="datetime-local"
              defaultValue={data.scheduledPublish ? new Date(data.scheduledPublish).toISOString().slice(0, 16) : ""}
              onChange={(e) => onUpdate({ 
                scheduledPublish: e.target.value ? new Date(e.target.value) : null 
              })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Publication Status</h4>
              <div className="space-y-2">
                {["draft", "scheduled", "published"].map(status => (
                  <label key={status} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="publishStatus"
                      value={status}
                      checked={data.status === status}
                      onChange={(e) => onUpdate({ status: e.target.value as "draft" | "active" | "inactive" })}
                    />
                    <span className="text-sm capitalize">{status}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Visibility</h4>
              <div className="space-y-2 text-sm">
                <div>🌐 Public: Visible to everyone</div>
                <div>🔒 Private: Admin only</div>
                <div>👥 Limited: Specific audiences</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}