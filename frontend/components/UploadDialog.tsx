"use client";

import { useEffect, useState } from "react";
import { Modal, Form, Input, Upload, message, Space } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { api } from "@/lib/api";

const normFile = (e: any) => {
  if (Array.isArray(e)) return e;
  return e?.fileList;
};

export default function UploadDialog({
  open, onClose
}: {
  open: boolean;
  onClose: (ok: boolean, newId?: string) => void;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null; // avoid SSR hydration mismatch

  // prevent auto-upload; we'll send via FormData manually
  const beforeUpload: UploadProps["beforeUpload"] = () => false;

  const handleOk = async () => {
    try {
      const vals = await form.validateFields();
      const molFile = vals.molecule?.[0]?.originFileObj as File | undefined;
      const struFile = vals.structures?.[0]?.originFileObj as File | undefined;

      if (!molFile || !struFile) {
        message.warning("Please select both molecule.xyz and structures.json");
        return;
      }
      if (!vals.energy_key) {
        message.warning("Please fill in energy_key");
        return;
      }

      const fd = new FormData();
      fd.append("molecule", molFile);
      fd.append("structures", struFile);
      fd.append("energy_key", vals.energy_key);
      if (vals.density_key) fd.append("density_key", vals.density_key);
      if (vals.dataset) fd.append("dataset", vals.dataset);

      setSubmitting(true);
      const r = await fetch(api("/api/datasets/upload"), { method: "POST", body: fd });
      if (!r.ok) throw new Error("Upload failed");
      const d = await r.json();
      message.success(`Uploaded: ${d.dsid} (${d.count} items)`);
      onClose(true, d.dsid);
      form.resetFields();
    } catch (e: any) {
      if (e?.errorFields) return; // form validation error
      message.error(e.message || "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Upload landscape"
      onOk={handleOk}
      onCancel={() => onClose(false)}
      okText="Upload"
      confirmLoading={submitting}
      destroyOnClose={false}
      maskClosable
      getContainer={false} // render within current tree to avoid SSR/portal mismatch
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Landscape Name" name="dataset">
          <Input placeholder="Leave empty to auto-generate" />
        </Form.Item>

        <Form.Item
          label="molecule.xyz"
          name="molecule"
          valuePropName="fileList"
          getValueFromEvent={normFile}
          rules={[{ required: true, message: "Please select molecule.xyz" }]}
        >
          <Upload.Dragger
            maxCount={1}
            accept=".xyz"
            beforeUpload={beforeUpload}
            showUploadList
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Click or drag a .xyz file here</p>
          </Upload.Dragger>
        </Form.Item>

        <Form.Item
          label="structures.json"
          name="structures"
          valuePropName="fileList"
          getValueFromEvent={normFile}
          rules={[{ required: true, message: "Please select structures.json" }]}
        >
          <Upload.Dragger
            maxCount={1}
            accept=".json"
            beforeUpload={beforeUpload}
            showUploadList
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Click or drag a .json file here</p>
          </Upload.Dragger>
        </Form.Item>

        <Space.Compact style={{ width: "100%" }}>
          <Form.Item
            label="energy_key (required)"
            name="energy_key"
            rules={[{ required: true }]}
            style={{ flex: 1 }}
          >
            <Input placeholder="e.g., energy" />
          </Form.Item>
          <Form.Item
            label="density_key (optional)"
            name="density_key"
            style={{ flex: 1, marginLeft: 8 }}
          >
            <Input placeholder="e.g., density (leave empty to compute)" />
          </Form.Item>
        </Space.Compact>
      </Form>
    </Modal>
  );
}
