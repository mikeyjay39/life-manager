import React, { useState } from "react";
import { View, TextInput, Button, Text, StyleSheet, Alert } from "react-native";

export default function SimpleForm() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

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
});
