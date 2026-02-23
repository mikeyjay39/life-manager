import React, { useState } from "react";
import { View, TextInput, Button, Text, StyleSheet, Alert, TouchableOpacity } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { createAuthenticatedClient } from "@/lib/api/client";
import { router } from "expo-router";

export default function SimpleForm() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const { token, logout } = useAuth();

  const testProtectedEndpoint = async () => {
    if (!token) {
      Alert.alert("Error", "No authentication token available.");
      return;
    }

    setTestLoading(true);
    try {
      const client = createAuthenticatedClient(token, async () => {
        Alert.alert("Session Expired", "Please log in again.");
        await logout();
        router.replace('/login');
      });

      const response = await client('/api/v1/auth/protected', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.text();
      Alert.alert("Success", `Protected endpoint says: ${data}`);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", err.message || "Something went wrong");
    } finally {
      setTestLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!value.trim()) {
      Alert.alert("Error", "Please enter a value.");
      return;
    }

    setLoading(true);
    try {
      const obj = {
        id: 2,
        title: value,
        content: value,
      };
      const jsonString = JSON.stringify(obj);
      const multipartBody = `--boundary\r\n` +
        `Content-Disposition: form-data; name=\"json\"\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${jsonString}\r\n` +
        `--boundary--`;

      // TODO: replace with your backend endpoint and parameters
      const response = await fetch("http://localhost:3000/documents", {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data; boundary=boundary",
        },
        body: multipartBody
        // body: JSON.stringify({ fieldName: value }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      Alert.alert("Success", "Request completed successfully!");
      console.log("Response:", data);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[styles.testButton, testLoading && styles.buttonDisabled]}
        onPress={testProtectedEndpoint}
        disabled={testLoading}
      >
        <Text style={styles.testButtonText}>
          {testLoading ? "Testing..." : "Test Protected Endpoint"}
        </Text>
      </TouchableOpacity>
      
      <Text style={styles.label}>Enter Value:</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        placeholder="Type something..."
      />
      <Button title={loading ? "Submitting..." : "Submit"} onPress={handleSubmit} disabled={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    marginTop: 50,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  testButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  testButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
