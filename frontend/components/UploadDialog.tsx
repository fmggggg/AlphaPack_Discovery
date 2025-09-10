"use client";

import { useEffect, useState } from "react";
import { Modal, Form, Input, Upload, message, Space, Radio, Divider, Tooltip } from "antd";
import type { UploadProps } from "antd";
import { InboxOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";

const normFile = (e: any) => (Array.isArray(e) ? e : e?.fileList);

export default function UploadDialog({
  open, onClose
}: { open: boolean; onClose: (ok: boolean, newId?: string) => void }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"tokens" | "cif">("tokens");

  useEffect(() => {
    if (!open) form.resetFields();
  }, [open, form]);

  const beforeUpload: UploadProps["beforeUpload"] = () => false;

  const handleOk = async () => {
    try {
      const vals = await form.validateFields();
      const fd = new FormData();
      fd.append("upload_mode", mode);
      if (vals.dataset) fd.append("dataset", vals.dataset);

      // molecule.xyz (common)
      const molFile = vals.molecule?.[0]?.originFileObj as File | undefined;
      if (!molFile) return message.warning("Please select molecule.xyz");
      fd.append("molecule", molFile);

      if (mode === "tokens") {
        const struFile = vals.structures?.[0]?.originFileObj as File | undefined;
        if (!struFile) return message.warning("Please select structures.json");
        if (!vals.energy_key) return message.warning("Please fill in energy_key");
        fd.append("structures", struFile);
        fd.append("energy_key", vals.energy_key);
        if (vals.density_key) fd.append("density_key", vals.density_key);
      } else {
        // CIF MODE
        const energyCsv = vals.energy_csv?.[0]?.originFileObj as File | undefined;
        const cifBundle = vals.cif_bundle?.[0]?.originFileObj as File | undefined;
        const cifZip = vals.cif_zip?.[0]?.originFileObj as File | undefined;
        if (!energyCsv) return message.warning("Please select energy.csv");
        if (!cifBundle && !cifZip) return message.warning("Please select a big .cif or a .zip of .cif files");

        fd.append("energy_csv", energyCsv);
        if (cifBundle) fd.append("cif_bundle", cifBundle);
        if (cifZip) fd.append("cif_zip", cifZip);

        fd.append("name_col", vals.name_col || "name");
        fd.append("energy_col", vals.energy_col || "energy");
        if (vals.density_col) fd.append("density_col", vals.density_col);
      }

      setSubmitting(true);
      const r = await fetch(api("/api/datasets/upload"), { method: "POST", body: fd });
      if (!r.ok) throw new Error("Upload failed");
      const d = await r.json();
      message.success(`Uploaded: ${d.dsid} (${d.count} items)`);
      onClose(true, d.dsid);
      form.resetFields();
      setMode("tokens");
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Upload Landscape"
      onOk={handleOk}
      onCancel={() => onClose(false)}
      okText="Upload"
      cancelText="Cancel" 
      confirmLoading={submitting}
      maskClosable
      getContainer={false}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Mode" required>
          <Radio.Group
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="tokens">Tokens JSON</Radio.Button>
            <Radio.Button value="cif">CIF bundle</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item label="Landscape Name" name="dataset">
          <Input placeholder="Leave empty to auto-generate" />
        </Form.Item>

        {/* Common: molecule.xyz */}
        <Form.Item
          label={<>molecule.xyz <Tooltip title="Used to derive SMILES/SELFIES for the dataset"><InfoCircleOutlined/></Tooltip></>}
          name="molecule"
          valuePropName="fileList"
          getValueFromEvent={normFile}
          rules={[{ required: true, message: "Please select molecule.xyz" }]}
        >
          <Upload.Dragger maxCount={1} accept=".xyz" beforeUpload={beforeUpload} showUploadList>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Click or drag a .xyz file here</p>
          </Upload.Dragger>
        </Form.Item>

        {mode === "tokens" ? (
          <>
            <Form.Item
              label="structures.json"
              name="structures"
              valuePropName="fileList"
              getValueFromEvent={normFile}
              rules={[{ required: true, message: "Please select structures.json" }]}
            >
              <Upload.Dragger maxCount={1} accept=".json" beforeUpload={beforeUpload} showUploadList>
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">Click or drag a .json file here</p>
              </Upload.Dragger>
            </Form.Item>
            <Space.Compact style={{ width: "100%" }}>
              <Form.Item label="energy_key (required)" name="energy_key" rules={[{ required: true }]} style={{ flex: 1 }}>
                <Input placeholder="e.g., energy" />
              </Form.Item>
              <Form.Item label="density_key (optional)" name="density_key" style={{ flex: 1, marginLeft: 8 }}>
                <Input placeholder="e.g., density (leave empty to compute)" />
              </Form.Item>
            </Space.Compact>
          </>
        ) : (
          <>
            <Form.Item
              label="energy.csv"
              name="energy_csv"
              valuePropName="fileList"
              getValueFromEvent={normFile}
              rules={[{ required: true, message: "Please select energy.csv" }]}
            >
              <Upload.Dragger maxCount={1} accept=".csv" beforeUpload={beforeUpload} showUploadList>
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">CSV must contain 'name' and 'energy' columns; 'density' is optional</p>
              </Upload.Dragger>
            </Form.Item>

            <Space.Compact style={{ width: "100%" }}>
              <Form.Item label="name column" name="name_col" style={{ flex: 1 }}>
                <Input placeholder="default: name" />
              </Form.Item>
              <Form.Item label="energy column" name="energy_col" style={{ flex: 1, marginLeft: 8 }}>
                <Input placeholder="default: energy" />
              </Form.Item>
              <Form.Item label="density column" name="density_col" style={{ flex: 1, marginLeft: 8 }}>
                <Input placeholder="optional: density" />
              </Form.Item>
            </Space.Compact>

            <Divider style={{ margin: "8px 0" }} />

            <Form.Item
              label="Big .cif (multi) OR .zip of .cif files"
              tooltip="Big .cif will be split by '#END'; each chunk's first line is used as its name. For .zip, file name (without .cif) is used."
              required
            >
              <Space.Compact style={{ width: "100%" }}>
                <Form.Item name="cif_bundle" valuePropName="fileList" getValueFromEvent={normFile} style={{ flex: 1 }}>
                  <Upload.Dragger maxCount={1} accept=".cif" beforeUpload={beforeUpload} showUploadList>
                    <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                    <p className="ant-upload-text">Big .cif (multi)</p>
                  </Upload.Dragger>
                </Form.Item>
                <Form.Item name="cif_zip" valuePropName="fileList" getValueFromEvent={normFile} style={{ flex: 1, marginLeft: 8 }}>
                  <Upload.Dragger maxCount={1} accept=".zip" beforeUpload={beforeUpload} showUploadList>
                    <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                    <p className="ant-upload-text">.zip of many .cif</p>
                  </Upload.Dragger>
                </Form.Item>
              </Space.Compact>
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
