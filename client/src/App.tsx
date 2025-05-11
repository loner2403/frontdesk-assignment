import React from 'react';
import './App.css';
import HelpRequest from './HelpRequest';
import styled from 'styled-components';

const AppContainer = styled.div`
  min-height: 100vh;
  background-color: #f5f7fa;
  padding: 2rem 1rem;
`;

const Footer = styled.footer`
  text-align: center;
  color: #666;
  font-size: 0.8rem;
  margin-top: 2rem;
`;

function App() {
  return (
    <AppContainer>
      <HelpRequest />
      <Footer>
        © {new Date().getFullYear()} Salon Help System - All rights reserved
      </Footer>
    </AppContainer>
  );
}

export default App;
