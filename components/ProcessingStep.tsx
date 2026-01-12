
import React from 'react';

interface ProcessingStepProps {
  label: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
  description?: string;
}

export const ProcessingStep: React.FC<ProcessingStepProps> = ({ label, status, description }) => {
  const getIcon = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
        );
      case 'completed':
        return (
          <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <div className="h-5 w-5 border-2 border-slate-300 rounded-full" />
        );
    }
  };

  return (
    <div className="flex items-start space-x-4 p-4 rounded-xl border border-slate-100 bg-white/50 mb-3 shadow-sm transition-all">
      <div className="mt-1">{getIcon()}</div>
      <div>
        <h4 className={`font-semibold ${status === 'loading' ? 'text-blue-600' : 'text-slate-700'}`}>
          {label}
        </h4>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
    </div>
  );
};
