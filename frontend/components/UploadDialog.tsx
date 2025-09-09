"use client";

import { useState } from "react";
import { Modal, Form, Input, Upload, message, Space } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { api } from "@/lib/api";

const normFile = (e: any) => {
  // e 可能是 File[] 或 { fileList }
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

  // 阻止自动上传到服务器，交给我们自己用 FormData 发
  const beforeUpload: UploadProps["beforeUpload"] = () => false;

  const handleOk = async () => {
    try {
      const vals = await form.validateFields();
      // 归一化后，这里是 fileList 数组
      const molFile = vals.molecule?.[0]?.originFileObj as File | undefined;
      const struFile = vals.structures?.[0]?.originFileObj as File | undefined;

      if (!molFile || !struFile) {
        message.warning("请选择 molecule.xyz 与 structures.json");
        return;
      }
      if (!vals.energy_key) {
        message.warning("请填写 energy_key");
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
      if (!r.ok) throw new Error("上传失败");
      const d = await r.json();
      message.success(`上传成功：${d.dsid}（${d.count} 条）`);
      onClose(true, d.dsid);
      form.resetFields();
    } catch (e: any) {
      if (e?.errorFields) return; // 表单校验错误
      message.error(e.message || "上传失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="上传数据集"
      onOk={handleOk}
      onCancel={() => onClose(false)}
      okText="上传"
      confirmLoading={submitting}
      destroyOnClose={false}
      forceRender
      maskClosable
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Dataset 名称（可选）" name="dataset">
          <Input placeholder="可留空自动生成" />
        </Form.Item>

        <Form.Item
          label="molecule.xyz"
          name="molecule"
          valuePropName="fileList"           // ⬅️ 关键1
          getValueFromEvent={normFile}       // ⬅️ 关键2
          rules={[{ required: true, message: "请选择 molecule.xyz" }]}
        >
          <Upload.Dragger
            maxCount={1}
            accept=".xyz"
            beforeUpload={beforeUpload}
            showUploadList
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽 .xyz 文件到此处</p>
          </Upload.Dragger>
        </Form.Item>

        <Form.Item
          label="structures.json"
          name="structures"
          valuePropName="fileList"           // ⬅️ 关键1
          getValueFromEvent={normFile}       // ⬅️ 关键2
          rules={[{ required: true, message: "请选择 structures.json" }]}
        >
          <Upload.Dragger
            maxCount={1}
            accept=".json"
            beforeUpload={beforeUpload}
            showUploadList
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽 .json 文件到此处</p>
          </Upload.Dragger>
        </Form.Item>

        <Space.Compact style={{ width: "100%" }}>
          <Form.Item
            label="energy_key（必填）"
            name="energy_key"
            rules={[{ required: true }]}
            style={{ flex: 1 }}
          >
            <Input placeholder="例如：energy" />
          </Form.Item>
          <Form.Item
            label="density_key（可选）"
            name="density_key"
            style={{ flex: 1, marginLeft: 8 }}
          >
            <Input placeholder="例如：density（留空则后台计算）" />
          </Form.Item>
        </Space.Compact>
      </Form>
    </Modal>
  );
}
