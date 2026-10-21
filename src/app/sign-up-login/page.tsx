import React, { Suspense } from 'react';
import LoginClient from './components/LoginClient';

export default function SignUpLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  );
}
