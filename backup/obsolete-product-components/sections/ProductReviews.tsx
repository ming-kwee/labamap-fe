"use client";
import React from "react";
import { ProductData } from "../ProductCreateForm";

interface ProductReviewsProps {
  data: ProductData;
}

export default function ProductReviews({ }: ProductReviewsProps) {
  const mockReviews = [
    { id: 1, rating: 5, comment: "Excellent quality!", author: "John D.", date: "2024-01-15" },
    { id: 2, rating: 4, comment: "Good value for money", author: "Sarah M.", date: "2024-01-14" },
  ];

  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-title-md font-semibold text-gray-900 dark:text-white mb-6">Customer Reviews</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">4.5</div>
            <div className="text-sm text-yellow-800">Average Rating</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/10 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{mockReviews.length}</div>
            <div className="text-sm text-green-800">Total Reviews</div>
          </div>
          <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">92%</div>
            <div className="text-sm text-blue-800">Positive</div>
          </div>
        </div>

        <div className="space-y-4">
          {mockReviews.map(review => (
            <div key={review.id} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex text-yellow-400">
                  {"★".repeat(review.rating)}{"☆".repeat(5-review.rating)}
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {review.author} - {review.date}
                </span>
              </div>
              <p className="text-gray-900 dark:text-white">{review.comment}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}