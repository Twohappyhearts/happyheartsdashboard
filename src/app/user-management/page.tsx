import React from 'react';
import AppLayout from '@/components/AppLayout';
import UserManagementClient from './components/UserManagementClient';

export default function UserManagementPage() {
  return (
    <AppLayout alertCount={3}>
      <UserManagementClient />
    </AppLayout>
  );
}