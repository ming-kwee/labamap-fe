'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Button from '@/components/ui/button/Button';
import { Loader2, LogOut, AlertCircle, CheckCircle } from '@/components/ui/icons/Icons';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';

interface LogoutButtonProps {
  variant?: 'primary' | 'outline';
  size?: 'sm' | 'md';
  showIcon?: boolean;
  showText?: boolean;
  onSuccess?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({
  variant = 'outline',
  size = 'md',
  showIcon = true,
  showText = true,
  onSuccess,
  className = "",
  children
}) => {
  const { logout, isLoading, user } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut || isLoading) return;

    setIsLoggingOut(true);
    setError(null);

    try {
      await logout();
      
      // Show success message briefly
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      
      // Call success callback
      onSuccess?.();
      
    } catch (error) {
      console.error('Logout failed:', error);
      
      let errorMessage = 'Logout failed. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('Network')) {
          errorMessage = 'Network error. You have been logged out locally.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
      
      // Clear error after 5 seconds
      setTimeout(() => setError(null), 5000);
      
    } finally {
      setIsLoggingOut(false);
    }
  };

  // If user is not logged in, don't show the button
  if (!user) {
    return null;
  }

  const buttonContent = children || (
    <>
      {showIcon && (
        isLoggingOut ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : showSuccess ? (
          <CheckCircle className="h-4 w-4 text-green-600" />
        ) : (
          <LogOut className="h-4 w-4" />
        )
      )}
      {showText && (
        isLoggingOut ? 'Logging out...' : 
        showSuccess ? 'Logged out!' :
        'Logout'
      )}
    </>
  );

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive" className="mb-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleLogout}
        disabled={isLoggingOut || isLoading}
        variant={variant}
        size={size}
        className={`${showSuccess ? 'bg-green-600 hover:bg-green-700 text-white' : ''} ${className}`}
      >
        {buttonContent}
      </Button>
    </div>
  );
};

// Simple logout button for header/nav usage
export const SimpleLogoutButton: React.FC<{
  className?: string;
  onSuccess?: () => void;
}> = ({ className = "", onSuccess }) => {
  return (
    <LogoutButton
      variant="outline"
      size="sm"
      showIcon={true}
      showText={false}
      onSuccess={onSuccess}
      className={className}
    />
  );
};

// Logout button with confirmation modal
export const LogoutButtonWithConfirmation: React.FC<{
  variant?: 'primary' | 'outline';
  size?: 'sm' | 'md';
  onSuccess?: () => void;
  className?: string;
}> = ({ variant = 'outline', size = 'md', onSuccess, className = "" }) => {
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleClick = () => {
    setShowConfirmation(true);
  };

  const handleConfirm = () => {
    setShowConfirmation(false);
    // The LogoutButton will handle the actual logout
  };

  const handleCancel = () => {
    setShowConfirmation(false);
  };

  return (
    <>
      <Button
        onClick={handleClick}
        variant={variant}
        size={size}
        className={className}
      >
        <LogOut className="h-4 w-4" />
        Logout
      </Button>

      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <AlertCircle className="h-5 w-5 text-orange-500 mr-3" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Confirm Logout
              </h3>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to log out? You will need to sign in again to access your account.
            </p>
            
            <div className="flex space-x-3 justify-end">
              <Button
                onClick={handleCancel}
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
              
              <div onClick={handleConfirm}>
                <LogoutButton
                  variant="primary"
                  size="sm"
                  onSuccess={onSuccess}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LogoutButton;