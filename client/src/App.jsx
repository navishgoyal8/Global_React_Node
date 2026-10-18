import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import InboxPage from './pages/crm/InboxPage';
import EngagePage from './pages/crm/EngagePage';
import InvoicesPage from './pages/crm/InvoicesPage';
import CreateInvoicePage from './pages/crm/CreateInvoicePage';
import LoginPage from './pages/crm/LoginPage';
import Storefront from './pages/StoreFront';
import CheckoutPage from './pages/CheckoutPage';
import CartPage from './pages/CartPage';
import OrderSuccessPage from './pages/OrderSuccessPage';
import InvoiceGateway from './pages/InvoiceGateway';
import FollowUpsPage from './pages/crm/FollowUpsPage';
import ReminderPopup from './components/Shared/ReminderPopup';
import PublicConsignmentAgreement from './pages/consignments-referral/PublicConsignmentAgreement';
import PublicReferralAgreement from './pages/consignments-referral/PublicReferralAgreement';
import CustomTeeConfigurator from './components/Shared/CustomTeeConfigurator';
import ApparelEditor from './pages/Apparels/ApparelEditor';
import ApparelReview from './pages/Apparels/ApparelReview';
import ApparelQuantity from './pages/Apparels/ApparelQuantity';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expirationTime = payload.exp * 1000;
    const currentTime = Date.now();

    if (currentTime > expirationTime) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return <Navigate to="/login" replace />;
    }
  } catch (error) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  return (
    <BrowserRouter>
      <ReminderPopup />
      <Routes>
        <Route 
          path="/login" 
          element={<LoginPage />} 
        />

        <Route 
          path="/sales/crm/seat-covers" 
          element={<Storefront />} 
        />

        <Route 
          path="/sales/crm/apparel" 
          element={<Storefront />} 
        />

        <Route 
          path="/sales/crm/cart" 
          element={<CartPage />} 
        />

        <Route 
          path="/sales/crm/checkout" 
          element={<CheckoutPage />} 
        />

        <Route 
          path="/sales/crm/order-success" 
          element={<OrderSuccessPage />} 
        />

        <Route 
        path="/sales/crm/consignment-agreement/:token" 
        element={<PublicConsignmentAgreement />} 
      />

      <Route 
        path="/sales/crm/referral-agreement/:token" 
        element={<PublicReferralAgreement />} 
      />

      <Route 
        path="/sales/crm/apparel/:id" 
        element={<CustomTeeConfigurator />}
      />

      <Route 
        path="/sales/crm/apparel/editor/:id" 
        element={<ApparelEditor />} 
      />

      <Route 
        path="/sales/crm/apparel/review/:id" 
        element={<ApparelReview />} 
      />

      <Route 
        path="/apparel/quantity/:id" 
        element={<ApparelQuantity />} 
      />

      <Route
          path="/sales/crm"
          element={<ProtectedRoute><InboxPage /></ProtectedRoute>}
        />

        <Route
          path="/sales/crm/engage"
          element={<ProtectedRoute><EngagePage /></ProtectedRoute>}
        />
        <Route
          path="/sales/crm/invoices"
          element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>}
        />
        <Route
          path="/sales/crm/create-invoice/:invoiceId?"
          element={<ProtectedRoute><CreateInvoicePage /></ProtectedRoute>}
        />

        <Route
          path="/sales/crm/followups/:invoiceId?"
          element={<ProtectedRoute><FollowUpsPage /></ProtectedRoute>}
        />

        <Route 
          path="/sales/crm/pay-invoice/:invoiceId" 
          element={<InvoiceGateway />} 
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;