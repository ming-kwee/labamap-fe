import BusinessRulesManager from '@/components/business-rules/BusinessRulesManager';

export const metadata = {
  title: 'Business Rules Management',
  description: 'Manage validation, transformation, and enhancement rules for your products',
};

export default function BusinessRulesPage() {
  return <BusinessRulesManager />;
}
