import React from 'react';
import Button from './ui/Button';

/**
 * Reusable confirmation dialog component
 * @param {Object} props
 * @param {boolean} props.isOpen - Controls dialog visibility
 * @param {function} props.onConfirm - Callback when confirm button is clicked
 * @param {function} props.onCancel - Callback when cancel/close button is clicked
 * @param {string} props.title - Dialog title
 * @param {string} props.message - Main message/question
 * @param {string} [props.confirmText='Confirm'] - Confirm button text
 * @param {string} [props.cancelText='Cancel'] - Cancel button text
 * @param {string} [props.variant='warning'] - Dialog variant: 'warning', 'danger', 'info'
 * @param {boolean} [props.showCloseButton=false] - Show X button at top-right
 * @param {boolean} [props.isLoading=false] - Show loading state on confirm button
 * @param {string} [props.loadingText='Processing...'] - Text to show when loading
 * @param {React.ReactNode} [props.detailsContent] - Optional content between message and buttons
 * @param {string} [props.warningText] - Optional warning text at bottom
 */
const ConfirmationDialog = ({
    isOpen,
    onConfirm,
    onCancel,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'warning',
    showCloseButton = false,
    isLoading = false,
    loadingText = 'Processing...',
    detailsContent,
    warningText,
}) => {
    if (!isOpen) return null;

    // Variant styles
    const variantStyles = {
        warning: {
            iconBg: 'bg-yellow-100',
            iconColor: 'text-yellow-600',
            btnVariant: 'primary',
        },
        danger: {
            iconBg: 'bg-red-100',
            iconColor: 'text-red-600',
            btnVariant: 'danger',
        },
        info: {
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
            btnVariant: 'primary',
        },
    };

    const styles = variantStyles[variant] || variantStyles.warning;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 transform transition-all relative">
                {/* Close button */}
                {showCloseButton && (
                    <button
                        onClick={onCancel}
                        disabled={isLoading}
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 rounded-lg p-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Close"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}

                <div className="p-6">
                    {/* Icon */}
                    <div className={`flex items-center justify-center w-16 h-16 mx-auto ${styles.iconBg} rounded-full mb-4`}>
                        <svg className={`w-8 h-8 ${styles.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>

                    {/* Content */}
                    <div className="text-center mb-6">
                        <h3 className="text-xl font-semibold text-gray-900 mb-3">
                            {title}
                        </h3>
                        <p className={`text-sm text-gray-600 leading-relaxed ${detailsContent || warningText ? 'mb-4' : 'mb-0'}`}>
                            {message}
                        </p>

                        {/* Optional details content */}
                        {detailsContent && (
                            <div>
                                {detailsContent}
                            </div>
                        )}

                        {/* Optional warning text */}
                        {warningText && (
                            <p className={`text-xs font-medium mt-4 ${variant === 'danger' ? 'text-red-600' : 'text-yellow-600'}`}>
                                {warningText}
                            </p>
                        )}
                    </div>

                    {/* Buttons */}
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                        <Button
                            variant="secondary"
                            scheme={styles.btnVariant}
                            onClick={onCancel}
                            disabled={isLoading}
                        >
                            {cancelText}
                        </Button>
                        <Button
                            variant={styles.btnVariant}
                            onClick={onConfirm}
                            disabled={isLoading}
                            loading={isLoading}
                        >
                            {isLoading ? loadingText : confirmText}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationDialog;
