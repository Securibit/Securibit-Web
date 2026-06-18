"use client";

import InputLabel from "@/components/Input/InputLabel";
import { supabase } from "@/config/supabase";
import { AppUser, toAppUser } from "@/types/authUser";
import { ensureProfile } from "@/lib/totp/account";
import { useRouter } from "next-nprogress-bar";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { totpItems } from "@/types/userData";
import { addTotp } from "@/lib/totp/crud";

const AddCodeClient = () => {
  const [totp, setTotp] = useState<totpItems>({ name: '', secret: '', category: '' });
  const [user, setUser] = useState<AppUser>();
  const router = useRouter();

  // 一進頁面就驗證，如果沒登入就導回首頁
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await ensureProfile();
        setUser(toAppUser(session.user));
      } else {
        setUser(undefined);
        toast.error("請先登入！", {
          position: "top-right"
        });
        router.push('/');
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新增 TOTP 資料
  const handleAddTotp = async () => {
    if (!user?.uid) return;

    const result = await addTotp(user.uid, totp);

    if (result.success) {
      toast.success('新增 TOTP 成功！', { position: 'top-right' });

      // 清空表單
      setTotp({ name: '', secret: '', category: '' });
    } else {
      toast.error(`新增 TOTP 失敗！\n錯誤訊息：${result.message}`, { position: 'top-right' });
    }
  };

  return (
    <div className="container mx-auto pt-5 pl-5 pr-5">
      <form onSubmit={e => e.preventDefault()}>
        <InputLabel
          value={totp.name}
          isRequired={true}
          label="Totp 名稱"
          onChange={e => setTotp({ ...totp, name: e.target.value })}
        />

        <InputLabel
          value={totp.secret}
          isRequired={true}
          label="Secret"
          onChange={e => setTotp({ ...totp, secret: e.target.value })}
        />

        <InputLabel
          value={totp.category}
          isRequired={true}
          label="類別"
          onChange={e => setTotp({ ...totp, category: e.target.value })}
        />
        <button
          onClick={handleAddTotp}
          className="px-3 py-2 border-2 border-bityo rounded-lg hover:bg-bityo/20">
          新增驗證碼
        </button>
      </form>
    </div>
  );
};

export default AddCodeClient;
