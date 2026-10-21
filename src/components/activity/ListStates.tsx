"use client";

import { Button } from "@heroui/react";
import Spinner from "@/components/ui/Loading/Spinner";
import { ListEmptyProps, LoadMoreButtonProps } from "@/types/Activity/ListStates";

// 紀錄列表共用的「載入中」「沒有紀錄」「載入更多」

export const ListLoading = () => (
  <div className="flex justify-center rounded-[18px] border border-line/70 bg-surface py-6">
    <Spinner />
  </div>
);

export const ListEmpty = (props: ListEmptyProps) => (
  <div className="rounded-[18px] border border-line/70 bg-surface px-5 py-6 text-center text-[15px] text-ink-muted">{props.text}</div>
);

export const LoadMoreButton = (props: LoadMoreButtonProps) => (
  <Button variant="light" color="primary" radius="full" className="self-center text-[17px]" onPress={props.onPress} isLoading={props.isLoading}>
    載入更多
  </Button>
);
