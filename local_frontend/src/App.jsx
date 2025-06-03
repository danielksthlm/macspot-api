import React from "react";
import MainLayout from "./components/MainLayout";
import ContactList from "./components/ContactList";

export default function App() {
  return (
    <MainLayout>
      <ContactList />
    </MainLayout>
  );
}